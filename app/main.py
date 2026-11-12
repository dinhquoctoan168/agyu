#!/usr/bin/env python3
import sys
import os

# Prefer X11/XWayland to avoid Wayland selection buffer cancellation on Drag-and-Drop
os.environ.setdefault("GDK_BACKEND", "x11,wayland")

import json
import base64
import time
import subprocess
import threading
import signal
import sqlite3
import re
import glob
import shutil
import uuid
import urllib.parse
import html
from datetime import datetime, timezone, timedelta
import psutil

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deep_think import DeepThinkManager

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
gi.require_version('Notify', '0.7')
from gi.repository import Gtk, WebKit2, GLib, Gdk, Notify

class AntigravityApp:
    def __init__(self, target_dir, extra_args):
        self.target_dir = os.path.abspath(target_dir)
        self.extra_args = list(extra_args)
        self.attachments_dir = os.path.join(self.target_dir, ".agy_wrap", "attachments")
        os.makedirs(self.attachments_dir, exist_ok=True)

        self.proc = None
        self.last_stderr_lines = []
        self.is_running = True
        self.active_conv_id = None
        self.is_pinned = False
        self._last_paste_time = 0
        self.last_sent_prompt = None
        self.is_waiting_new_turn = False
        self.instance_id = uuid.uuid4().hex[:8]
        self.deep_think_manager = DeepThinkManager(self.target_dir, instance_id=self.instance_id)

        # Initialize Desktop Notifications
        self._current_notification = None
        try:
            if not Notify.is_initted():
                Notify.init("Antigravity Desktop")
        except Exception as e:
            print(f"[Notify init Error] {e}", file=sys.stderr)

        # Check if conversation was passed via command line
        for i, arg in enumerate(self.extra_args):
            if arg in ("--conversation", "-c") and i + 1 < len(self.extra_args):
                if arg == "--conversation":
                    self.active_conv_id = self.extra_args[i + 1]

        # Multi-window Session Registry & Guardrail Hook initialization
        self.sessions_dir = os.path.expanduser("~/.gemini/antigravity-cli/agy_wrap_sessions")
        os.makedirs(self.sessions_dir, exist_ok=True)
        self.approved_files = []
        self.is_free_to_go = False
        self.active_action_id = None
        self._ensure_guardrail_hook()
        self._ensure_default_rules()
        self.update_session_registry()

        # Setup GTK Window
        self.window = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
        dir_name = os.path.basename(self.target_dir) or self.target_dir
        self.window.set_title(f"Antigravity Desktop - {dir_name}")
        self.window.set_default_size(1120, 820)
        self.window.set_position(Gtk.WindowPosition.CENTER)
        self.window.connect("destroy", self.on_destroy)
        self.window.connect("key-press-event", self.on_window_key_press)
        self.window.connect("focus-in-event", self.on_focus_in)

        # Dark background style for window
        rgba = Gdk.RGBA()
        rgba.parse("#181825")
        self.window.override_background_color(Gtk.StateFlags.NORMAL, rgba)

        # WebKit Settings
        settings = WebKit2.Settings()
        settings.set_enable_developer_extras(True)
        settings.set_allow_file_access_from_file_urls(True)
        settings.set_allow_universal_access_from_file_urls(True)
        settings.set_enable_javascript(True)
        settings.set_javascript_can_access_clipboard(True)

        # WebKit UserContentManager for JavaScript <-> Python IPC
        self.content_manager = WebKit2.UserContentManager()
        self.content_manager.register_script_message_handler("bridge")
        self.content_manager.connect("script-message-received::bridge", self.on_script_message)

        # WebKit WebView
        self.webview = WebKit2.WebView.new_with_user_content_manager(self.content_manager)
        self.webview.set_settings(settings)
        self.webview.set_background_color(rgba)

        # Setup Native Drag and Drop for WebView
        self.is_native_dragging = False
        self.webview.drag_dest_set(
            Gtk.DestDefaults.ALL,
            [],
            Gdk.DragAction.COPY
        )
        self.webview.drag_dest_add_uri_targets()
        self.webview.connect("drag-motion", self.on_drag_motion)
        self.webview.connect("drag-leave", self.on_drag_leave)
        self.webview.connect("drag-data-received", self.on_drag_data_received)
        self.webview.connect("key-press-event", self.on_window_key_press)
        self.webview.connect("focus-in-event", self.on_focus_in)
        self.webview.connect("decide-policy", self.on_decide_policy)

        self.window.add(self.webview)

        # Load local HTML UI
        ui_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui", "index.html")
        self.webview.load_uri(f"file://{ui_path}")

        # Start agy process
        self.start_agy_process()

        # Periodic Quota update timer (every 5 minutes)
        GLib.timeout_add_seconds(300, self._periodic_quota_check)

        # Periodic Child Process check (every 3 seconds)
        GLib.timeout_add_seconds(3, self._periodic_proc_check)

    def _ensure_default_rules(self):
        gemini_dir = os.path.expanduser("~/.gemini")
        os.makedirs(gemini_dir, exist_ok=True)
        global_gemini_path = os.path.join(gemini_dir, "GEMINI.md")

        # Do not overwrite if user already has a global GEMINI.md
        if os.path.isfile(global_gemini_path):
            return

        # Find bundled GEMINI.md in repository root
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        bundled_gemini = os.path.join(project_root, "GEMINI.md")
        if os.path.isfile(bundled_gemini):
            try:
                shutil.copy2(bundled_gemini, global_gemini_path)
            except Exception as e:
                print(f"[_ensure_default_rules Error] {e}", file=sys.stderr)

    def _ensure_guardrail_hook(self):
        hook_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guardrail_hook.py")
        if not os.path.isfile(hook_script):
            return
        try:
            os.chmod(hook_script, 0o755)
        except Exception:
            pass

        config_dir = os.path.expanduser("~/.gemini/config")
        os.makedirs(config_dir, exist_ok=True)
        hooks_path = os.path.join(config_dir, "hooks.json")

        hooks_data = {}
        if os.path.isfile(hooks_path):
            try:
                with open(hooks_path, "r", encoding="utf-8") as f:
                    hooks_data = json.load(f)
            except Exception:
                hooks_data = {}

        if "agy-guardrail" not in hooks_data:
            hooks_data["agy-guardrail"] = {
                "PreToolUse": [
                    {
                        "matcher": "write_file|edit_file",
                        "hooks": [
                            {
                                "type": "command",
                                "command": f"python3 {hook_script}"
                            }
                        ]
                    }
                ]
            }
            try:
                with open(hooks_path, "w", encoding="utf-8") as f:
                    json.dump(hooks_data, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"[_ensure_guardrail_hook Error] {e}", file=sys.stderr)

    def update_session_registry(self):
        if not self.active_conv_id:
            return
        os.makedirs(self.sessions_dir, exist_ok=True)
        session_file = os.path.join(self.sessions_dir, f"{self.active_conv_id}.json")
        data = {
            "conversation_id": self.active_conv_id,
            "target_dir": self.target_dir,
            "pid": self.proc.pid if self.proc else None,
            "approved_files": self.approved_files,
            "is_free_to_go": self.is_free_to_go,
            "active_action_id": self.active_action_id,
            "last_updated": time.time()
        }
        try:
            with open(session_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[update_session_registry Error] {e}", file=sys.stderr)

    def cleanup_session_registry(self):
        if self.active_conv_id:
            session_file = os.path.join(self.sessions_dir, f"{self.active_conv_id}.json")
            if os.path.isfile(session_file):
                try:
                    os.remove(session_file)
                except Exception:
                    pass

    def perform_rollback(self):
        if not self.active_conv_id:
            return False, "Không có phiên hội thoại hiện tại để hoàn tác.", []

        snapshots_base = os.path.join(self.target_dir, ".agy_wrap", "snapshots", self.active_conv_id)
        if not os.path.isdir(snapshots_base):
            return False, "Không tìm thấy snapshot nào cho phiên làm việc này.", []

        snaps = sorted([d for d in os.listdir(snapshots_base) if os.path.isdir(os.path.join(snapshots_base, d)) and not d.endswith("_rolled_back")])
        if not snaps:
            return False, "Chưa có bản snapshot nào khả dụng để hoàn tác.", []

        latest_snap = snaps[-1]
        snap_dir = os.path.join(snapshots_base, latest_snap)
        manifest_file = os.path.join(snap_dir, "manifest.json")

        if not os.path.isfile(manifest_file):
            return False, f"Thiếu file manifest trong snapshot {latest_snap}.", []

        try:
            with open(manifest_file, "r", encoding="utf-8") as mf:
                manifest = json.load(mf)
        except Exception as e:
            return False, f"Lỗi đọc manifest: {e}", []

        files_record = manifest.get("files", {})
        restored = []

        for rel_p, info in files_record.items():
            target_file = os.path.join(self.target_dir, rel_p)
            existed = info.get("existed", False)
            backup_path = info.get("backup_path")

            if existed and backup_path and os.path.isfile(backup_path):
                os.makedirs(os.path.dirname(target_file), exist_ok=True)
                shutil.copy2(backup_path, target_file)
                restored.append(rel_p)
            elif not existed:
                if os.path.isfile(target_file):
                    os.remove(target_file)
                    restored.append(f"{rel_p} (đã xóa tệp mới tạo)")

        try:
            os.rename(snap_dir, f"{snap_dir}_rolled_back")
        except Exception:
            pass

        return True, f"Đã hoàn tác thành công {len(restored)} tệp về trước ACTION ({latest_snap}).", restored

    def bring_to_front(self):
        GLib.idle_add(self._do_bring_to_front)

    def _do_bring_to_front(self):
        try:
            self.window.deiconify()
            self.window.show()
            curr_time = Gtk.get_current_event_time()
            if not curr_time:
                curr_time = Gdk.CURRENT_TIME
            self.window.present_with_time(curr_time)
            self.window.present()
            self.window.set_urgency_hint(True)

            gdk_win = self.window.get_window()
            if gdk_win:
                xid = getattr(gdk_win, "get_xid", None)
                if callable(xid):
                    wid = xid()
                    if wid:
                        subprocess.run(
                            ["xdotool", "windowactivate", "--sync", str(wid)],
                            check=False,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL
                        )
            self.send_to_js({"type": "focus_input"})
        except Exception as e:
            print(f"[bring_to_front Error] {e}", file=sys.stderr)

    def clear_urgency(self):
        GLib.idle_add(self._do_clear_urgency)

    def _do_clear_urgency(self):
        try:
            self.window.set_urgency_hint(False)
            if self._current_notification:
                try:
                    self._current_notification.close()
                except Exception:
                    pass
                self._current_notification = None
        except Exception as e:
            print(f"[clear_urgency Error] {e}", file=sys.stderr)

    def open_external_url(self, url):
        if not url:
            return
        GLib.idle_add(self._do_open_external_url, url)

    def _do_open_external_url(self, url):
        try:
            curr_time = Gtk.get_current_event_time()
            if not curr_time:
                curr_time = Gdk.CURRENT_TIME
            Gtk.show_uri_on_window(self.window, url, curr_time)
        except Exception:
            try:
                subprocess.Popen(["xdg-open", url])
            except Exception as e:
                print(f"[open_external_url Error] {e}", file=sys.stderr)

    def on_focus_in(self, widget, event):
        self._do_clear_urgency()
        return False

    def on_decide_policy(self, webview, decision, decision_type):
        if decision_type in (WebKit2.PolicyDecisionType.NAVIGATION_ACTION, WebKit2.PolicyDecisionType.NEW_WINDOW_ACTION):
            uri = None
            if hasattr(decision, "get_navigation_action"):
                nav_action = decision.get_navigation_action()
                if nav_action and hasattr(nav_action, "get_request"):
                    req = nav_action.get_request()
                    if req and hasattr(req, "get_uri"):
                        uri = req.get_uri()
            if not uri and hasattr(decision, "get_request"):
                req = decision.get_request()
                if req and hasattr(req, "get_uri"):
                    uri = req.get_uri()

            if uri and (uri.startswith("http://") or uri.startswith("https://") or uri.startswith("mailto:")):
                decision.ignore()
                self._do_open_external_url(uri)
                return True
        return False

    def send_desktop_notification(self, title, message, urgency="normal", event_type="info"):
        def _show():
            try:
                icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui", "assets", "icon.png")
                if not os.path.isfile(icon_path):
                    icon_path = "dialog-information"

                dir_name = os.path.basename(self.target_dir) or self.target_dir
                full_title = f"[{dir_name}] {title}"

                notification = Notify.Notification.new(full_title, message, icon_path)
                if urgency == "critical":
                    notification.set_urgency(Notify.Urgency.CRITICAL)
                elif urgency == "low":
                    notification.set_urgency(Notify.Urgency.LOW)
                else:
                    notification.set_urgency(Notify.Urgency.NORMAL)

                def _on_action(notif, action, user_data=None):
                    self.bring_to_front()

                notification.add_action("default", "Mở", _on_action)
                notification.add_action("focus", "Mở cửa sổ", _on_action)
                notification.show()
                self._current_notification = notification
            except Exception as e:
                print(f"[send_desktop_notification Error] {e}", file=sys.stderr)

        GLib.idle_add(_show)

    def stop_agy_process(self):
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=1.0)
            except Exception:
                try:
                    self.proc.kill()
                    self.proc.wait(timeout=1.0)
                except Exception:
                    pass
            self.proc = None
        self.is_waiting_new_turn = False

    def start_agy_process(self):
        self.stop_agy_process()
        self.last_stderr_lines = []

        agy_cmd = os.environ.get("AGY_BIN") or shutil.which("agy") or ("/mnt/Agent/bin/agy" if os.path.isfile("/mnt/Agent/bin/agy") else "agy")

        cmd = [
            agy_cmd,
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--prompt=",
            "--dangerously-skip-permissions"
        ] + self.extra_args

        try:
            self.proc = subprocess.Popen(
                cmd,
                cwd=self.target_dir,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
        except Exception as e:
            GLib.idle_add(self.send_to_js, {
                "type": "error",
                "message": f"Không thể khởi động tiến trình agy: {str(e)}"
            })
            self.send_desktop_notification(
                "Lỗi khởi động",
                f"Không thể khởi động tiến trình agy: {str(e)}",
                urgency="critical",
                event_type="error"
            )
            return

        # Start background threads to read stdout & stderr
        threading.Thread(target=self.read_stdout, daemon=True).start()
        threading.Thread(target=self.read_stderr, daemon=True).start()

    def read_stdout(self):
        proc = self.proc
        while self.is_running and proc and proc.stdout:
            line = proc.stdout.readline()
            if not line:
                break
            line_str = line.strip()
            if not line_str:
                continue

            try:
                data = json.loads(line_str)
                event_name = data.get("event")
                conv_id = data.get("conversation_id") or data.get("step_update", {}).get("conversation_id") or data.get("result", {}).get("conversation_id")
                if conv_id:
                    if conv_id != self.active_conv_id:
                        self.active_conv_id = conv_id
                        self.update_session_registry()
                    else:
                        self.active_conv_id = conv_id

                if event_name == "step_update":
                    threading.Thread(target=self.read_latest_thinking, daemon=True).start()
                    GLib.idle_add(self.send_to_js, {
                        "type": "agy_event",
                        "payload": data
                    })
                elif event_name == "result":
                    self.is_waiting_new_turn = False
                    def finalize_turn():
                        time.sleep(0.08)
                        self.read_latest_thinking()
                        self.send_quota_update()
                        self.send_processes_update()
                        GLib.idle_add(self.send_to_js, {
                            "type": "agy_event",
                            "payload": data
                        })
                        if self.deep_think_manager and self.deep_think_manager.is_active and not self.deep_think_manager.is_paused:
                            self.handle_deep_think_turn_finished()
                        else:
                            self.send_desktop_notification(
                                "Hoàn tất yêu cầu",
                                "Antigravity đã xử lý xong yêu cầu của bạn.",
                                urgency="normal",
                                event_type="info"
                            )
                    threading.Thread(target=finalize_turn, daemon=True).start()
                else:
                    GLib.idle_add(self.send_to_js, {
                        "type": "agy_event",
                        "payload": data
                    })
            except json.JSONDecodeError:
                GLib.idle_add(self.send_to_js, {
                    "type": "agy_raw",
                    "text": line_str
                })

        # Check if process exited unexpectedly or closed stdout
        if self.is_running and proc == self.proc:
            try:
                # Wait briefly to let process exit completely and reap zombie
                try:
                    ret = proc.wait(timeout=1.0)
                except subprocess.TimeoutExpired:
                    ret = proc.poll()
                    if ret is None:
                        proc.kill()
                        ret = proc.wait(timeout=1.0)
            except Exception:
                ret = proc.poll() if proc else None

            # Get recent stderr output to extract meaningful error
            err_summary = ""
            if self.last_stderr_lines:
                err_summary = " | ".join(self.last_stderr_lines[-2:])

            if ret is not None and (ret != 0 or self.is_waiting_new_turn):
                error_detail = err_summary if err_summary else f"mã thoát: {ret}"
                msg = f"Tiến trình bị lỗi ({error_detail}) nên dừng lại."
                self.send_desktop_notification(
                    "Lỗi tiến trình",
                    f"Tiến trình agy bị dừng bất ngờ ({error_detail}).",
                    urgency="critical",
                    event_type="error"
                )
                GLib.idle_add(self.send_to_js, {
                    "type": "agy_crashed",
                    "error": error_detail,
                    "exit_code": ret,
                    "message": msg
                })
            else:
                GLib.idle_add(self.send_to_js, {
                    "type": "process_stopped"
                })

            if self.proc == proc:
                self.proc = None
            self.is_waiting_new_turn = False

    def read_stderr(self):
        proc = self.proc
        while self.is_running and proc and proc.stderr:
            line = proc.stderr.readline()
            if not line:
                break
            err_str = line.strip()
            if err_str:
                self.last_stderr_lines.append(err_str)
                if len(self.last_stderr_lines) > 20:
                    self.last_stderr_lines.pop(0)
                GLib.idle_add(self.send_to_js, {
                    "type": "agy_stderr",
                    "text": err_str
                })

    def send_to_js(self, payload):
        try:
            js_code = f"if (window.onBridgeMessage) {{ window.onBridgeMessage({json.dumps(payload)}); }}"
            self.webview.evaluate_javascript(js_code, -1, None, None, None, None, None)
        except Exception as e:
            print(f"[Error send_to_js] {e}", file=sys.stderr)

    def _parse_conversation_row(self, r):
        uris = []
        try:
            uris = json.loads(r[4])
        except Exception:
            pass

        ws_dir = ""
        if uris and len(uris) > 0 and uris[0].startswith("file://"):
            raw_path = uris[0][7:]
            ws_dir = os.path.abspath(urllib.parse.unquote(raw_path))

        step_count = r[5] or 0
        title = r[1] or ""
        preview = r[2] or ""

        return {
            "id": r[0],
            "title": title or "Hội thoại không tiêu đề",
            "preview": preview,
            "last_modified": r[3] or "",
            "workspace": ws_dir,
            "workspace_name": os.path.basename(ws_dir) if ws_dir else "",
            "step_count": step_count
        }

    def _get_all_parsed_conversations(self):
        db_path = os.path.expanduser("~/.gemini/antigravity-cli/conversation_summaries.db")
        if not os.path.exists(db_path):
            return []

        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT conversation_id, title, preview, last_modified_time, workspace_uris, step_count
                FROM conversation_summaries
                ORDER BY last_modified_time DESC
            """)
            rows = cursor.fetchall()
            conn.close()

            items = []
            for r in rows:
                item = self._parse_conversation_row(r)
                if item["id"] == self.active_conv_id or item["step_count"] > 0 or (item["title"] and item["title"] != "Hội thoại không tiêu đề"):
                    items.append(item)
            return items
        except Exception as e:
            print(f"[Error _get_all_parsed_conversations] {e}", file=sys.stderr)
            return []

    def get_conversations_overview(self):
        all_convs = self._get_all_parsed_conversations()
        norm_target_dir = os.path.abspath(self.target_dir)

        # 1. Folder hiện tại
        current_convs = [c for c in all_convs if c["workspace"] and os.path.abspath(c["workspace"]) == norm_target_dir]
        current_initial = current_convs[:15]
        current_has_more = len(current_convs) > 15

        # 2. 20 hội thoại gần đây nhất toàn hệ thống
        recent_20 = all_convs[:20]

        # 3. Danh mục các folder (workspaces catalog)
        from collections import defaultdict
        ws_catalog = defaultdict(lambda: {"count": 0, "last_activity": "", "name": ""})
        for c in all_convs:
            ws = c["workspace"]
            if not ws:
                continue
            ws_catalog[ws]["count"] += 1
            if not ws_catalog[ws]["last_activity"] or c["last_modified"] > ws_catalog[ws]["last_activity"]:
                ws_catalog[ws]["last_activity"] = c["last_modified"]
            ws_catalog[ws]["name"] = c["workspace_name"]

        catalog_list = []
        for ws, info in ws_catalog.items():
            catalog_list.append({
                "workspace": ws,
                "workspace_name": info["name"] or os.path.basename(ws) or ws,
                "conversation_count": info["count"],
                "last_activity": info["last_activity"],
                "is_current": (os.path.abspath(ws) == norm_target_dir)
            })

        if not any(x["is_current"] for x in catalog_list):
            catalog_list.insert(0, {
                "workspace": norm_target_dir,
                "workspace_name": os.path.basename(norm_target_dir) or norm_target_dir,
                "conversation_count": 0,
                "last_activity": "",
                "is_current": True
            })

        catalog_list.sort(key=lambda x: (1 if x["is_current"] else 0, x["last_activity"]), reverse=True)

        return {
            "current_items": current_initial,
            "current_total": len(current_convs),
            "current_has_more": current_has_more,
            "recent_items": recent_20,
            "catalog": catalog_list,
            "current_workspace": norm_target_dir,
            "current_workspace_name": os.path.basename(norm_target_dir) or norm_target_dir
        }

    def get_folder_conversations(self, workspace, offset=0, limit=15):
        all_convs = self._get_all_parsed_conversations()
        norm_ws = os.path.abspath(workspace) if workspace else self.target_dir
        matched = [c for c in all_convs if c["workspace"] and os.path.abspath(c["workspace"]) == norm_ws]
        sliced = matched[offset : offset + limit]
        return {
            "workspace": norm_ws,
            "items": sliced,
            "offset": offset,
            "limit": limit,
            "total": len(matched),
            "has_more": (offset + limit) < len(matched)
        }

    def get_past_conversations(self):
        overview = self.get_conversations_overview()
        return overview["current_items"]

    def _periodic_quota_check(self):
        if self.is_running:
            threading.Thread(target=self.send_quota_update, daemon=True).start()
            return True
        return False

    def calculate_quota(self):
        try:
            agy_bin = os.environ.get("AGY_BIN") or shutil.which("agy") or ("/mnt/Agent/bin/agy" if os.path.isfile("/mnt/Agent/bin/agy") else "agy")
            cmd = [agy_bin, "-p", "/quota", "--output-format", "json"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
            if res.returncode != 0:
                print(f"[Error calculate_quota] agy exited with {res.returncode}: {res.stderr}", file=sys.stderr)
                return None

            raw = json.loads(res.stdout)
            cmd_data = raw.get("command", {}).get("data", {})
            groups = cmd_data.get("groups", [])
            now = datetime.now(timezone.utc)

            def parse_reset(reset_str, fraction):
                if fraction >= 1.0:
                    return "Sẵn sàng 100%"
                if not reset_str:
                    return ""
                try:
                    dt = datetime.fromisoformat(reset_str.replace("Z", "+00:00"))
                    secs = max(0, int((dt - now).total_seconds()))
                    h = secs // 3600
                    m = (secs % 3600) // 60
                    if h > 0:
                        return f"Làm mới sau {h}h {m:02d}m"
                    return f"Làm mới sau {m}m"
                except Exception:
                    return ""

            # Locate Gemini Models group
            gemini_group = next((g for g in groups if "gemini" in g.get("name", "").lower()), None)
            primary_group = gemini_group or (groups[0] if groups else {})

            def extract_buckets(g):
                wk = None
                f5 = None
                for b in g.get("buckets", []):
                    w = b.get("window", "")
                    bid = b.get("id", "")
                    if w == "weekly" or "week" in bid:
                        wk = b
                    elif w == "5h" or "5h" in bid:
                        f5 = b
                return wk, f5

            p_week, p_5h = extract_buckets(primary_group)

            p_week_frac = p_week.get("remaining_fraction", 1.0) if p_week else 1.0
            p_5h_frac = p_5h.get("remaining_fraction", 1.0) if p_5h else 1.0

            pct_week = round(p_week_frac * 100, 2)
            pct_5h = round(p_5h_frac * 100, 2)

            refresh_week = parse_reset(p_week.get("reset_time", ""), p_week_frac) if p_week else ""
            refresh_5h = parse_reset(p_5h.get("reset_time", ""), p_5h_frac) if p_5h else ""

            return {
                "type": "quota_update",
                "pct_week": pct_week,
                "pct_5h": pct_5h,
                "refresh_week": refresh_week,
                "refresh_5h": refresh_5h,
                "primary_name": primary_group.get("name", "Gemini Models"),
                "groups": groups
            }
        except Exception as e:
            print(f"[Error calculate_quota] {e}", file=sys.stderr)
            return None

    def send_quota_update(self):
        quota = self.calculate_quota()
        if quota:
            GLib.idle_add(self.send_to_js, quota)

    def get_accounts_info(self):
        try:
            bin_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bin", "agy-account")
            res = subprocess.run([bin_path, "list", "--json"], capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                profiles = json.loads(res.stdout)
                active = next((p for p in profiles if p.get("is_active")), None)
                return {
                    "profiles": profiles,
                    "active_email": active.get("email") if active else ""
                }
        except Exception as e:
            print(f"[Error get_accounts_info] {e}", file=sys.stderr)
        return {"profiles": [], "active_email": ""}

    def send_accounts_update(self):
        info = self.get_accounts_info()
        GLib.idle_add(self.send_to_js, {
            "type": "accounts_update",
            "profiles": info["profiles"],
            "active_email": info["active_email"]
        })

    def _periodic_proc_check(self):
        if self.is_running:
            threading.Thread(target=self.send_processes_update, daemon=True).start()
            return True
        return False

    def _format_process_info(self, p, is_direct=True):
        try:
            pid = p.pid
            name = p.name()
            cmdline = p.cmdline()
            full_cmd = " ".join(cmdline) if cmdline else name

            try:
                mem_bytes = p.memory_info().rss
                mem_mb = round(mem_bytes / (1024 * 1024), 1)
            except Exception:
                mem_mb = 0

            try:
                started = p.create_time()
                elapsed = max(0, int(time.time() - started))
                if elapsed < 60:
                    runtime_str = f"{elapsed}s"
                elif elapsed < 3600:
                    runtime_str = f"{elapsed // 60}m {elapsed % 60}s"
                else:
                    runtime_str = f"{elapsed // 3600}h {(elapsed % 3600) // 60}m"
            except Exception:
                runtime_str = ""

            return {
                "pid": pid,
                "name": name,
                "cmdline": full_cmd,
                "short_cmd": full_cmd[:65] + ("..." if len(full_cmd) > 65 else ""),
                "memory_mb": mem_mb,
                "runtime": runtime_str,
                "is_direct": is_direct
            }
        except Exception:
            return {
                "pid": getattr(p, "pid", 0),
                "name": "unknown",
                "cmdline": "",
                "short_cmd": "",
                "memory_mb": 0,
                "runtime": "",
                "is_direct": is_direct
            }

    def get_child_processes(self):
        results = []
        seen_pids = set()
        agy_pid = self.proc.pid if self.proc else None

        # Inspect descendants of agy process only
        if agy_pid:
            try:
                parent = psutil.Process(agy_pid)
                for c in parent.children(recursive=True):
                    try:
                        if c.pid not in seen_pids and c.is_running() and c.status() != psutil.STATUS_ZOMBIE:
                            seen_pids.add(c.pid)
                            results.append(self._format_process_info(c, is_direct=True))
                    except Exception:
                        continue
            except Exception:
                pass

        return results

    def kill_child_process(self, pid):
        try:
            target = psutil.Process(pid)
            # Terminate child sub-processes first
            for sub in target.children(recursive=True):
                try:
                    sub.terminate()
                except Exception:
                    pass
            target.terminate()
            try:
                target.wait(timeout=0.8)
            except psutil.TimeoutExpired:
                target.kill()
            return True, f"Đã tắt tiến trình PID {pid}"
        except psutil.NoSuchProcess:
            return True, f"Tiến trình PID {pid} đã kết thúc"
        except Exception as e:
            return False, f"Lỗi tắt tiến trình: {str(e)}"

    def kill_all_child_processes(self):
        procs = self.get_child_processes()
        killed = 0
        for p in procs:
            pid = p.get("pid")
            if pid:
                success, _ = self.kill_child_process(pid)
                if success:
                    killed += 1
        return killed

    def send_processes_update(self):
        procs = self.get_child_processes()
        GLib.idle_add(self.send_to_js, {
            "type": "processes_update",
            "processes": procs,
            "count": len(procs)
        })

    def read_latest_thinking(self):
        if not self.active_conv_id:
            return
        brain_dir = os.path.expanduser(f"~/.gemini/antigravity-cli/brain/{self.active_conv_id}/.system_generated/logs")
        full_path = os.path.join(brain_dir, "transcript_full.jsonl")
        compact_path = os.path.join(brain_dir, "transcript.jsonl")
        transcript_path = compact_path
        if os.path.exists(full_path) and os.path.getsize(full_path) > 0:
            transcript_path = full_path
        elif not os.path.exists(compact_path):
            return
        try:
            thinkings = []
            last_user_input_content = None
            with open(transcript_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        step_data = json.loads(line)
                        if step_data.get("type") == "USER_INPUT":
                            thinkings = []
                            last_user_input_content = step_data.get("content", "")
                        elif step_data.get("source") == "MODEL":
                            th = step_data.get("thinking")
                            if th and th.strip():
                                thinkings.append(th.strip())
                    except Exception:
                        continue

            if self.is_waiting_new_turn and self.last_sent_prompt:
                check_key = self.last_sent_prompt[:50] if len(self.last_sent_prompt) > 50 else self.last_sent_prompt
                if not last_user_input_content or check_key not in last_user_input_content:
                    return
                self.is_waiting_new_turn = False

            if thinkings:
                combined_thinking = "\n\n---\n\n".join(thinkings)
                GLib.idle_add(self.send_to_js, {
                    "type": "thinking_update",
                    "thinking": combined_thinking
                })
        except Exception as e:
            print(f"[read_latest_thinking Error] {e}", file=sys.stderr)

    def handle_deep_think_turn_finished(self):
        if not self.active_conv_id or not self.deep_think_manager:
            return
        history = self.load_transcript(self.active_conv_id)
        assistant_msgs = [m for m in history if m.get("role") == "assistant"]
        if not assistant_msgs:
            return
        last_content = assistant_msgs[-1].get("content", "")
        success, msg = self.deep_think_manager.process_turn_result(last_content, self.active_conv_id)

        state = self.deep_think_manager.get_state()
        GLib.idle_add(self.send_to_js, {
            "type": "deep_think_update",
            "state": state,
            "message": msg
        })

        if self.deep_think_manager.has_next_task():
            node, prompt = self.deep_think_manager.get_next_prompt_and_node()
            if node and prompt:
                GLib.idle_add(self.send_to_js, {
                    "type": "deep_think_step_starting",
                    "node": node.to_dict(),
                    "message": f"Mở cuộc hội thoại mới cho Phase: {node.title} (Tầng {node.level})..."
                })

                time.sleep(0.6)
                self.stop_agy_process()
                self.active_conv_id = None
                self.extra_args = []
                self.last_sent_prompt = prompt[:50]
                self.is_waiting_new_turn = True
                self.start_agy_process()

                def send_next():
                    time.sleep(0.6)
                    if self.proc and self.proc.stdin:
                        req = {
                            "event": "user",
                            "message": {
                                "content": prompt
                            }
                        }
                        try:
                            self.proc.stdin.write(json.dumps(req) + "\n")
                            self.proc.stdin.flush()
                        except Exception as e:
                            print(f"[DeepThink send_next error] {e}", file=sys.stderr)
                threading.Thread(target=send_next, daemon=True).start()
        else:
            GLib.idle_add(self.send_to_js, {
                "type": "deep_think_completed",
                "state": self.deep_think_manager.get_state(),
                "plan_file": self.deep_think_manager.plan_md_path
            })
            self.send_desktop_notification(
                "Deep Think hoàn tất",
                "Toàn bộ kế hoạch Deep Think đã được thực thi hoàn tất.",
                urgency="normal",
                event_type="info"
            )

    def load_transcript(self, conv_id):
        brain_dir = os.path.expanduser(f"~/.gemini/antigravity-cli/brain/{conv_id}/.system_generated/logs")
        full_path = os.path.join(brain_dir, "transcript_full.jsonl")
        compact_path = os.path.join(brain_dir, "transcript.jsonl")

        transcript_path = compact_path
        if os.path.exists(full_path) and os.path.getsize(full_path) > 0:
            transcript_path = full_path
        elif not os.path.exists(compact_path):
            return []

        messages = []
        try:
            with open(transcript_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        step_data = json.loads(line)
                        step_type = step_data.get("type")

                        if step_type == "USER_INPUT":
                            raw = step_data.get("content", "")
                            match = re.search(r"<USER_REQUEST>(.*?)</USER_REQUEST>", raw, re.DOTALL)
                            clean_text = match.group(1).strip() if match else raw
                            messages.append({
                                "role": "user",
                                "content": clean_text,
                                "created_at": step_data.get("created_at")
                            })
                        elif step_type == "PLANNER_RESPONSE":
                            content = step_data.get("content", "")
                            thinking = step_data.get("thinking", "")
                            tool_calls = step_data.get("tool_calls", [])

                            # Aggregate consecutive PLANNER_RESPONSE turns into a single assistant message
                            if messages and messages[-1].get("role") == "assistant":
                                last_msg = messages[-1]
                                if content:
                                    last_msg["content"] = (last_msg["content"] + "\n\n" + content).strip() if last_msg["content"] else content
                                if thinking:
                                    last_msg["thinking"] = (last_msg["thinking"] + "\n\n" + thinking).strip() if last_msg["thinking"] else thinking
                                if tool_calls:
                                    last_msg["tool_calls"].extend(tool_calls)
                            else:
                                messages.append({
                                    "role": "assistant",
                                    "content": content,
                                    "thinking": thinking,
                                    "tool_calls": list(tool_calls) if tool_calls else [],
                                    "created_at": step_data.get("created_at")
                                })
                    except Exception:
                        pass
        except Exception as e:
            print(f"[Error load_transcript] {e}", file=sys.stderr)

        return messages

    def normalize_target_path(self, raw_path):
        if not raw_path:
            return None
        p = str(raw_path).strip()
        if p.startswith("<") and p.endswith(">"):
            p = p[1:-1].strip()
        if p.startswith("file://"):
            p = re.sub(r"^file://+", "/", p)
        p = html.unescape(p)
        p = urllib.parse.unquote(p)
        if "#" in p:
            p = p.split("#", 1)[0]
        if "?" in p:
            p = p.split("?", 1)[0]
        p = p.rstrip(".,;:")
        while p.endswith(")"):
            if p.count(")") > p.count("("):
                p = p[:-1].rstrip(".,;:")
            else:
                break
        p = p.strip()
        if not p:
            return None
        if not os.path.isabs(p):
            p = os.path.join(self.target_dir, p)
        return os.path.normpath(p)

    def on_script_message(self, content_manager, js_result):
        try:
            val = js_result.get_js_value()
            msg_str = val.to_string()
            data = json.loads(msg_str)
            action = data.get("action")

            if action == "ui_ready":
                dir_name = os.path.basename(self.target_dir) or self.target_dir
                self.send_to_js({
                    "type": "init_info",
                    "cwd": self.target_dir,
                    "dir_name": dir_name,
                    "extra_args": self.extra_args,
                    "active_conv_id": self.active_conv_id,
                    "is_pinned": self.is_pinned
                })

                # If initialized with a specific conversation, preload its transcript
                if self.active_conv_id:
                    history = self.load_transcript(self.active_conv_id)
                    if history:
                        self.send_to_js({
                            "type": "conversation_loaded",
                            "id": self.active_conv_id,
                            "messages": history
                        })

                # Trigger background calculation for quota progress lines
                threading.Thread(target=self.send_quota_update, daemon=True).start()
                # Send accounts list and active account
                threading.Thread(target=self.send_accounts_update, daemon=True).start()
                # Send active child processes list
                threading.Thread(target=self.send_processes_update, daemon=True).start()
                # Send deep think state
                if self.deep_think_manager:
                    self.send_to_js({
                        "type": "deep_think_update",
                        "state": self.deep_think_manager.get_state()
                    })

            elif action == "get_accounts":
                threading.Thread(target=self.send_accounts_update, daemon=True).start()

            elif action == "switch_account":
                target_email = data.get("email")
                def do_switch():
                    bin_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bin", "agy-account")
                    res = subprocess.run([bin_path, "switch", target_email], capture_output=True, text=True, timeout=8)
                    if res.returncode == 0:
                        self.send_accounts_update()
                        self.start_agy_process()
                        self.send_quota_update()
                        GLib.idle_add(self.send_to_js, {
                            "type": "account_switched",
                            "email": target_email
                        })
                    else:
                        GLib.idle_add(self.send_to_js, {
                            "type": "error",
                            "message": f"Lỗi chuyển tài khoản: {res.stderr.strip()}"
                        })
                threading.Thread(target=do_switch, daemon=True).start()

            elif action == "refresh_quota":
                threading.Thread(target=self.send_quota_update, daemon=True).start()

            elif action == "toggle_pin":
                self.is_pinned = not self.is_pinned
                self.window.set_keep_above(self.is_pinned)
                self.send_to_js({
                    "type": "pin_state",
                    "is_pinned": self.is_pinned
                })

            elif action == "get_conversations":
                overview = self.get_conversations_overview()
                self.send_to_js({
                    "type": "conversations_data",
                    "current_workspace": overview["current_workspace"],
                    "current_workspace_name": overview["current_workspace_name"],
                    "current_items": overview["current_items"],
                    "current_total": overview["current_total"],
                    "current_has_more": overview["current_has_more"],
                    "recent_items": overview["recent_items"],
                    "catalog": overview["catalog"],
                    "active_conv_id": self.active_conv_id
                })

            elif action in ("get_folder_conversations", "load_more_conversations"):
                target_ws = data.get("workspace") or self.target_dir
                offset = int(data.get("offset", 0))
                limit = int(data.get("limit", 15))
                context = data.get("context", "current")
                folder_data = self.get_folder_conversations(target_ws, offset, limit)
                self.send_to_js({
                    "type": "folder_conversations_result",
                    "workspace": folder_data["workspace"],
                    "items": folder_data["items"],
                    "offset": folder_data["offset"],
                    "limit": folder_data["limit"],
                    "total": folder_data["total"],
                    "has_more": folder_data["has_more"],
                    "context": context
                })

            elif action == "select_conversation":
                conv_id = data.get("id")
                target_ws = data.get("workspace")
                target_ws_norm = os.path.abspath(target_ws) if target_ws else self.target_dir

                # TH1: Cùng thư mục hiện tại -> nạp ngay vào cửa sổ này
                if target_ws_norm == self.target_dir:
                    self.active_conv_id = conv_id
                    history = self.load_transcript(conv_id)
                    self.send_to_js({
                        "type": "conversation_loaded",
                        "id": conv_id,
                        "messages": history
                    })
                    # Tái khởi động agy với cờ --conversation
                    self.extra_args = ["--conversation", conv_id]
                    self.start_agy_process()

                # TH2: Khác thư mục -> mở cửa sổ mới độc lập
                else:
                    cmd = [sys.executable, os.path.abspath(__file__), target_ws_norm, "--conversation", conv_id]
                    subprocess.Popen(cmd)
                    self.send_to_js({
                        "type": "new_window_opened",
                        "workspace": target_ws_norm,
                        "workspace_name": os.path.basename(target_ws_norm),
                        "conv_id": conv_id
                    })

            elif action == "new_chat":
                self.active_conv_id = None
                self.extra_args = []
                self.last_sent_prompt = None
                self.is_waiting_new_turn = False
                self.start_agy_process()
                self.send_to_js({
                    "type": "new_chat_started"
                })

            elif action == "send_prompt":
                prompt_text = data.get("prompt", "")
                attachments = data.get("attachments", [])

                # Multi-window Action Plan & Free to go isolation
                approved = data.get("approved_plan")
                is_free = data.get("is_free_to_go")
                if is_free is not None:
                    self.is_free_to_go = bool(is_free)
                if approved is not None:
                    self.approved_files = approved

                is_action = bool(re.search(r'\bACTION\s*$', prompt_text.strip()))
                if is_action:
                    self.active_action_id = datetime.now().strftime("%Y%m%d_%H%M%S")
                    if self.active_conv_id:
                        snap_dir = os.path.join(self.target_dir, ".agy_wrap", "snapshots", self.active_conv_id, self.active_action_id)
                        os.makedirs(os.path.join(snap_dir, "files"), exist_ok=True)
                        manifest_file = os.path.join(snap_dir, "manifest.json")
                        if not os.path.isfile(manifest_file):
                            try:
                                with open(manifest_file, "w", encoding="utf-8") as mf:
                                    json.dump({"action_id": self.active_action_id, "created_at": datetime.now().isoformat(), "files": {}}, mf, ensure_ascii=False, indent=2)
                            except Exception:
                                pass
                else:
                    self.active_action_id = None
                self.update_session_registry()

                self.last_sent_prompt = prompt_text.strip() if prompt_text else (attachments[0].get("path") if attachments else "")
                self.is_waiting_new_turn = True

                full_content_parts = []
                if attachments:
                    for att in attachments:
                        att_path = att.get("path")
                        if att_path:
                            full_content_parts.append(f"@{att_path}")

                if prompt_text:
                    full_content_parts.append(prompt_text)

                final_content = "\n\n".join(full_content_parts)

                # Ensure process is alive; if not, restart fresh instance bound to active_conv_id
                if not self.proc or self.proc.poll() is not None:
                    if self.active_conv_id:
                        has_conv = False
                        for idx, arg in enumerate(self.extra_args):
                            if arg in ("--conversation", "-c") and idx + 1 < len(self.extra_args):
                                self.extra_args[idx + 1] = self.active_conv_id
                                has_conv = True
                                break
                        if not has_conv:
                            self.extra_args += ["--conversation", self.active_conv_id]
                    self.start_agy_process()

                if self.proc and self.proc.stdin:
                    req = {
                        "event": "user",
                        "message": {
                            "content": final_content
                        }
                    }
                    try:
                        self.proc.stdin.write(json.dumps(req) + "\n")
                        self.proc.stdin.flush()
                    except Exception as e:
                        print(f"[send_prompt error] {e}", file=sys.stderr)
                        self.stop_agy_process()
                        GLib.idle_add(self.send_to_js, {
                            "type": "agy_crashed",
                            "error": str(e),
                            "message": f"Tiến trình bị lỗi ({str(e)}) nên dừng lại."
                        })

            elif action == "save_clipboard_image":
                b64_data = data.get("data", "")
                if "," in b64_data:
                    b64_data = b64_data.split(",", 1)[1]

                img_bytes = base64.b64decode(b64_data)
                timestamp = time.strftime("%Y%m%d_%H%M%S")
                millis = int((time.time() % 1) * 1000)
                filename = f"img_{timestamp}_{millis}.png"
                filepath = os.path.join(self.attachments_dir, filename)

                with open(filepath, "wb") as f:
                    f.write(img_bytes)

                rel_path = os.path.relpath(filepath, self.target_dir)

                self.send_to_js({
                    "type": "clipboard_saved",
                    "path": rel_path,
                    "abs_path": filepath,
                    "file_url": f"file://{filepath}",
                    "name": filename
                })

            elif action == "save_dropped_file":
                filename = data.get("name", "file")
                b64_data = data.get("data", "")
                if "," in b64_data:
                    b64_data = b64_data.split(",", 1)[1]

                file_bytes = base64.b64decode(b64_data)
                filepath = os.path.join(self.attachments_dir, filename)

                with open(filepath, "wb") as f:
                    f.write(file_bytes)

                rel_path = os.path.relpath(filepath, self.target_dir)

                self.send_to_js({
                    "type": "dropped_file_saved",
                    "path": rel_path,
                    "abs_path": filepath,
                    "file_url": f"file://{filepath}",
                    "name": filename
                })

            elif action == "register_existing_file":
                abs_path = data.get("path", "")
                self.register_file(abs_path)

            elif action == "paste_clipboard":
                self.check_and_paste_image()

            elif action == "request_thinking":
                threading.Thread(target=self.read_latest_thinking, daemon=True).start()

            elif action == "clear_urgency":
                self.clear_urgency()

            elif action == "open_url":
                url = data.get("url", "")
                if url:
                    self.open_external_url(url)

            elif action == "open_file":
                filepath = self.normalize_target_path(data.get("path"))
                if filepath and os.path.exists(filepath):
                    try:
                        subprocess.Popen(["xdg-open", filepath])
                    except Exception as e:
                        print(f"[open_file Error] {e}", file=sys.stderr)
                        self.send_to_js({"type": "toast", "message": f"Lỗi khi mở tệp: {e}"})
                else:
                    filename = os.path.basename(filepath) if filepath else "tệp"
                    self.send_to_js({"type": "toast", "message": f"Không tìm thấy tệp: {filename}"})

            elif action == "open_folder":
                filepath = self.normalize_target_path(data.get("path"))
                if filepath:
                    folder = filepath if os.path.isdir(filepath) else os.path.dirname(filepath)
                    if os.path.exists(folder):
                        try:
                            if os.path.isfile(filepath):
                                subprocess.Popen(["nautilus", "--select", filepath])
                            else:
                                subprocess.Popen(["xdg-open", folder])
                        except Exception:
                            try:
                                subprocess.Popen(["xdg-open", folder])
                            except Exception as e:
                                print(f"[open_folder Error] {e}", file=sys.stderr)
                                self.send_to_js({"type": "toast", "message": f"Lỗi khi mở thư mục: {e}"})
                    else:
                        self.send_to_js({"type": "toast", "message": f"Thư mục không tồn tại: {folder}"})

            elif action == "pause_process":
                if self.proc and self.proc.pid:
                    try:
                        os.kill(self.proc.pid, signal.SIGSTOP)
                    except Exception as e:
                        print(f"[pause_process Error] {e}", file=sys.stderr)

            elif action == "resume_process":
                if self.proc and self.proc.pid:
                    try:
                        os.kill(self.proc.pid, signal.SIGCONT)
                    except Exception as e:
                        print(f"[resume_process Error] {e}", file=sys.stderr)

            elif action == "stop_process":
                self.stop_agy_process()
                # Restart fresh agy instance bound to active conversation if present
                if self.active_conv_id:
                    self.extra_args = ["--conversation", self.active_conv_id]
                self.start_agy_process()
                self.send_to_js({"type": "process_stopped"})
                threading.Thread(target=self.send_processes_update, daemon=True).start()
                self.send_desktop_notification(
                    "Đã dừng tiến trình",
                    "Công việc hiện tại đã được dừng lại.",
                    urgency="normal",
                    event_type="warning"
                )

            elif action == "notify_violation":
                tool_name = data.get("tool_name", "công cụ")
                target_path = data.get("target_path", "")
                filename = os.path.basename(target_path) if target_path else target_path
                self.send_desktop_notification(
                    "⚠️ Cảnh báo vi phạm",
                    f"Thao tác '{tool_name}' trên tệp '{filename}' ngoài kế hoạch đã duyệt. Tiến trình đã tạm dừng!",
                    urgency="critical",
                    event_type="violation"
                )

            elif action == "bring_to_front":
                self.bring_to_front()

            elif action == "sync_action_plan":
                self.approved_files = data.get("approved_plan") or []
                self.is_free_to_go = data.get("is_free_to_go", False)
                if data.get("is_action"):
                    self.active_action_id = datetime.now().strftime("%Y%m%d_%H%M%S")
                    if self.active_conv_id:
                        snap_dir = os.path.join(self.target_dir, ".agy_wrap", "snapshots", self.active_conv_id, self.active_action_id)
                        os.makedirs(os.path.join(snap_dir, "files"), exist_ok=True)
                        manifest_file = os.path.join(snap_dir, "manifest.json")
                        if not os.path.isfile(manifest_file):
                            try:
                                with open(manifest_file, "w", encoding="utf-8") as mf:
                                    json.dump({"action_id": self.active_action_id, "created_at": datetime.now().isoformat(), "files": {}}, mf, ensure_ascii=False, indent=2)
                            except Exception:
                                pass
                else:
                    self.active_action_id = None
                self.update_session_registry()

            elif action == "rollback_action":
                def do_rollback():
                    success, msg, restored = self.perform_rollback()
                    GLib.idle_add(self.send_to_js, {
                        "type": "rollback_result",
                        "success": success,
                        "message": msg,
                        "restored_files": restored
                    })
                threading.Thread(target=do_rollback, daemon=True).start()

            elif action == "get_child_processes":
                threading.Thread(target=self.send_processes_update, daemon=True).start()

            elif action == "kill_child_process":
                target_pid = data.get("pid")
                def do_kill():
                    if target_pid:
                        success, msg = self.kill_child_process(target_pid)
                        self.send_processes_update()
                        GLib.idle_add(self.send_to_js, {
                            "type": "toast",
                            "message": msg
                        })
                threading.Thread(target=do_kill, daemon=True).start()

            elif action == "kill_all_child_processes":
                def do_kill_all():
                    count = self.kill_all_child_processes()
                    self.send_processes_update()
                    GLib.idle_add(self.send_to_js, {
                        "type": "toast",
                        "message": f"Đã tắt {count} tiến trình phụ."
                    })
                threading.Thread(target=do_kill_all, daemon=True).start()

            elif action == "start_deep_think":
                prompt_text = data.get("prompt", "").strip()
                enable_synthesis = data.get("enable_synthesis", True)
                max_levels = data.get("max_levels", 5)
                if not prompt_text or not self.deep_think_manager:
                    return

                self.deep_think_manager.start_new_session(root_task=prompt_text, enable_synthesis=enable_synthesis, max_levels=max_levels)
                node, prompt = self.deep_think_manager.get_next_prompt_and_node()
                if node and prompt:
                    self.stop_agy_process()
                    self.active_conv_id = None
                    self.extra_args = []
                    self.last_sent_prompt = prompt[:50]
                    self.is_waiting_new_turn = True
                    self.start_agy_process()

                    def send_root():
                        time.sleep(0.6)
                        if self.proc and self.proc.stdin:
                            req = {
                                "event": "user",
                                "message": {
                                    "content": prompt
                                }
                            }
                            try:
                                self.proc.stdin.write(json.dumps(req) + "\n")
                                self.proc.stdin.flush()
                            except Exception as e:
                                print(f"[DeepThink start send error] {e}", file=sys.stderr)
                    threading.Thread(target=send_root, daemon=True).start()

                    self.send_to_js({
                        "type": "deep_think_started",
                        "state": self.deep_think_manager.get_state(),
                        "node": node.to_dict()
                    })

            elif action == "stop_deep_think":
                if self.deep_think_manager:
                    self.deep_think_manager.stop()
                    self.send_to_js({
                        "type": "deep_think_stopped",
                        "state": self.deep_think_manager.get_state()
                    })

            elif action == "pause_deep_think":
                if self.deep_think_manager:
                    self.deep_think_manager.pause()
                    self.send_to_js({
                        "type": "deep_think_update",
                        "state": self.deep_think_manager.get_state()
                    })

            elif action == "resume_deep_think":
                if self.deep_think_manager:
                    self.deep_think_manager.resume()
                    self.send_to_js({
                        "type": "deep_think_update",
                        "state": self.deep_think_manager.get_state()
                    })
                    if not self.deep_think_manager.current_node_id and self.deep_think_manager.has_next_task():
                        threading.Thread(target=self.handle_deep_think_turn_finished, daemon=True).start()

            elif action == "get_deep_think_state":
                if self.deep_think_manager:
                    self.send_to_js({
                        "type": "deep_think_update",
                        "state": self.deep_think_manager.get_state()
                    })

            elif action == "reset_deep_think":
                if self.deep_think_manager:
                    new_state = self.deep_think_manager.reset_session()
                    self.send_to_js({
                        "type": "deep_think_reset",
                        "state": new_state
                    })

            elif action == "skip_deep_think_node":
                node_id = data.get("node_id")
                if self.deep_think_manager and node_id:
                    new_state = self.deep_think_manager.skip_node(node_id)
                    self.send_to_js({
                        "type": "deep_think_update",
                        "state": new_state,
                        "message": f"Đã bỏ qua node: {node_id}"
                    })
                    if not self.deep_think_manager.current_node_id and self.deep_think_manager.has_next_task():
                        threading.Thread(target=self.handle_deep_think_turn_finished, daemon=True).start()

            elif action == "mark_deep_think_atomic":
                node_id = data.get("node_id")
                if self.deep_think_manager and node_id:
                    new_state = self.deep_think_manager.mark_node_atomic(node_id)
                    self.send_to_js({
                        "type": "deep_think_update",
                        "state": new_state,
                        "message": f"Đã chốt node {node_id} là tối giản (làm ngay)."
                    })
                    if not self.deep_think_manager.current_node_id and self.deep_think_manager.has_next_task():
                        threading.Thread(target=self.handle_deep_think_turn_finished, daemon=True).start()

        except Exception as e:
            print(f"[Error on_script_message] {e}", file=sys.stderr)

    def register_file(self, abs_path):
        if not abs_path or not os.path.exists(abs_path):
            return
        rel_path = os.path.relpath(abs_path, self.target_dir)
        filename = os.path.basename(abs_path)
        is_image = filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'))
        self.send_to_js({
            "type": "file_registered",
            "path": rel_path if not rel_path.startswith("..") else abs_path,
            "abs_path": abs_path,
            "file_url": f"file://{abs_path}" if is_image else "",
            "name": filename,
            "is_image": is_image
        })

    def on_drag_motion(self, widget, context, x, y, time):
        if not self.is_native_dragging:
            self.is_native_dragging = True
            self.send_to_js({"type": "native_drag_enter"})
        Gdk.drag_status(context, Gdk.DragAction.COPY, time)
        return True

    def on_drag_leave(self, widget, context, time):
        if self.is_native_dragging:
            self.is_native_dragging = False
            self.send_to_js({"type": "native_drag_leave"})

    def on_drag_data_received(self, widget, context, x, y, data, info, time):
        self.is_native_dragging = False
        self.send_to_js({"type": "native_drag_leave"})
        if data.get_length() > 0:
            uris = data.get_uris()
            if uris:
                for uri in uris:
                    try:
                        filename, _ = GLib.filename_from_uri(uri)
                        if filename and os.path.exists(filename):
                            self.register_file(filename)
                    except Exception as e:
                        print(f"[DragDrop Error] {e}", file=sys.stderr)
                context.finish(True, False, time)
                return
        context.finish(False, False, time)

    def _save_and_emit_pixbuf(self, pixbuf):
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        millis = int((time.time() % 1) * 1000)
        filename = f"img_{timestamp}_{millis}.png"
        filepath = os.path.join(self.attachments_dir, filename)
        pixbuf.savev(filepath, "png", [], [])
        rel_path = os.path.relpath(filepath, self.target_dir)

        self.send_to_js({
            "type": "clipboard_saved",
            "path": rel_path,
            "abs_path": filepath,
            "file_url": f"file://{filepath}",
            "name": filename
        })
        return True

    def _save_and_emit_bytes(self, img_bytes):
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        millis = int((time.time() % 1) * 1000)
        filename = f"img_{timestamp}_{millis}.png"
        filepath = os.path.join(self.attachments_dir, filename)
        with open(filepath, "wb") as f:
            f.write(img_bytes)
        rel_path = os.path.relpath(filepath, self.target_dir)

        self.send_to_js({
            "type": "clipboard_saved",
            "path": rel_path,
            "abs_path": filepath,
            "file_url": f"file://{filepath}",
            "name": filename
        })
        return True

    def check_and_paste_image(self):
        # 1. Try GTK clipboard
        clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
        if clipboard.wait_is_image_available():
            pixbuf = clipboard.wait_for_image()
            if pixbuf:
                return self._save_and_emit_pixbuf(pixbuf)

        # 2. Try wl-paste fallback (Wayland)
        try:
            res = subprocess.run(
                ["wl-paste", "--type", "image/png"],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=0.4
            )
            if res.returncode == 0 and len(res.stdout) > 0:
                return self._save_and_emit_bytes(res.stdout)
        except Exception:
            pass

        return False

    def on_window_key_press(self, widget, event):
        is_ctrl = bool(event.state & Gdk.ModifierType.CONTROL_MASK)
        if is_ctrl and event.keyval in (Gdk.KEY_v, Gdk.KEY_V):
            now = time.time()
            if now - self._last_paste_time < 0.4:
                return True
            if self.check_and_paste_image():
                self._last_paste_time = now
                return True
        return False

    def on_destroy(self, widget):
        self.is_running = False
        if self.deep_think_manager:
            self.deep_think_manager.cleanup()
        self.cleanup_session_registry()
        self.stop_agy_process()
        try:
            if Notify.is_initted():
                Notify.uninit()
        except Exception:
            pass
        Gtk.main_quit()

def main():
    if len(sys.argv) < 2:
        target_dir = os.getcwd()
        extra_args = []
    else:
        target_dir = sys.argv[1]
        extra_args = sys.argv[2:]

    app = AntigravityApp(target_dir, extra_args)
    app.window.show_all()
    Gtk.main()

if __name__ == "__main__":
    main()
