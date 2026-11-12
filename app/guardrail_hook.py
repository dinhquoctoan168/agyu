#!/usr/bin/env python3
import sys
import os
import json
import shutil

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps({"decision": "allow"}))
            return

        payload = json.loads(raw_input)
    except Exception:
        print(json.dumps({"decision": "allow"}))
        return

    conv_id = payload.get("conversationId", "")
    tool_call = payload.get("toolCall", {})
    tool_name = tool_call.get("name", "")
    tool_args = tool_call.get("args", {})
    target_path = tool_args.get("Path") or tool_args.get("path") or tool_args.get("file_path") or ""
    workspace_paths = payload.get("workspacePaths", [])

    # If not a file-modifying tool or no target path, allow
    if tool_name not in ("write_file", "edit_file") or not target_path:
        print(json.dumps({"decision": "allow"}))
        return

    clean_target = target_path.strip().strip("'\"")

    # Always allow internal system, brain logs, artifacts, and agy_wrap metadata
    if any(k in clean_target for k in (
        "/.gemini/antigravity-cli/brain/",
        "/.system_generated/",
        "/.agy_wrap/"
    )):
        print(json.dumps({"decision": "allow"}))
        return

    # Look for session registry in global agy_wrap_sessions
    sessions_dir = os.path.expanduser("~/.gemini/antigravity-cli/agy_wrap_sessions")
    session_file = None

    if conv_id:
        f = os.path.join(sessions_dir, f"{conv_id}.json")
        if os.path.isfile(f):
            session_file = f

    # Fallback lookup by matching workspace path
    if not session_file and os.path.isdir(sessions_dir):
        for fname in os.listdir(sessions_dir):
            if fname.endswith(".json"):
                f = os.path.join(sessions_dir, fname)
                try:
                    with open(f, "r", encoding="utf-8") as sf:
                        sdata = json.load(sf)
                        s_ws = sdata.get("target_dir")
                        if s_ws and (s_ws in workspace_paths or any(w.startswith(s_ws) for w in workspace_paths)):
                            session_file = f
                            break
                except Exception:
                    continue

    # If no session registered for agy_wrap, allow (run directly in terminal or non-agyu session)
    if not session_file:
        print(json.dumps({"decision": "allow"}))
        return

    try:
        with open(session_file, "r", encoding="utf-8") as sf:
            session_data = json.load(sf)
    except Exception:
        print(json.dumps({"decision": "allow"}))
        return

    is_free_to_go = session_data.get("is_free_to_go", False)

    # Check approved files only when NOT in Free to go mode
    if not is_free_to_go:
        approved_files = session_data.get("approved_files")
        target_dir = session_data.get("target_dir") or (workspace_paths[0] if workspace_paths else "")

        def normalize(p):
            p_clean = p.strip().strip("'\"")
            if target_dir and p_clean.startswith(target_dir):
                p_clean = p_clean[len(target_dir):].lstrip("/\\")
            p_clean = p_clean.lstrip("./\\").replace("\\", "/")
            return p_clean

        norm_target = normalize(clean_target)
        target_basename = os.path.basename(norm_target)

        is_approved = False
        if approved_files:
            for item in approved_files:
                norm_item = normalize(str(item))
                item_basename = os.path.basename(norm_item)
                if norm_target == norm_item:
                    is_approved = True
                    break
                if norm_target.endswith("/" + norm_item):
                    is_approved = True
                    break
                if norm_item.endswith("/" + norm_target):
                    is_approved = True
                    break
                if target_basename and target_basename == item_basename and ("/" not in norm_item or "/" not in norm_target):
                    is_approved = True
                    break

        if not is_approved:
            # Record violation to session for UI feedback
            try:
                session_data["last_violation"] = {
                    "tool": tool_name,
                    "target_path": clean_target,
                    "time": str(os.path.getmtime(session_file))
                }
                with open(session_file, "w", encoding="utf-8") as sf:
                    json.dump(session_data, sf, ensure_ascii=False, indent=2)
            except Exception:
                pass

            reason_msg = (
                f"VIOLATION: Tệp '{clean_target}' chưa được phê duyệt trong kế hoạch ACTION hiện tại. "
                f"Thao tác {tool_name} bị chặn hoàn toàn trước khi sửa đổi tệp để bảo vệ an toàn mã nguồn."
            )
            print(json.dumps({
                "decision": "deny",
                "reason": reason_msg
            }))
            return

    # Perform automatic pre-write backup for instant rollback capability
    target_dir = session_data.get("target_dir") or (workspace_paths[0] if workspace_paths else "")
    active_action_id = session_data.get("active_action_id")
    if active_action_id and target_dir and conv_id:
        try:
            snapshot_dir = os.path.join(target_dir, ".agy_wrap", "snapshots", conv_id, active_action_id)
            files_backup_dir = os.path.join(snapshot_dir, "files")
            manifest_file = os.path.join(snapshot_dir, "manifest.json")
            os.makedirs(files_backup_dir, exist_ok=True)

            abs_target = clean_target if os.path.isabs(clean_target) else os.path.join(target_dir, clean_target)
            abs_target = os.path.abspath(abs_target)

            manifest = {"action_id": active_action_id, "files": {}}
            if os.path.isfile(manifest_file):
                try:
                    with open(manifest_file, "r", encoding="utf-8") as mf:
                        manifest = json.load(mf)
                except Exception:
                    pass

            rel_p = os.path.relpath(abs_target, target_dir)
            if rel_p not in manifest["files"]:
                if os.path.exists(abs_target) and os.path.isfile(abs_target):
                    backup_path = os.path.join(files_backup_dir, rel_p)
                    os.makedirs(os.path.dirname(backup_path), exist_ok=True)
                    shutil.copy2(abs_target, backup_path)
                    manifest["files"][rel_p] = {
                        "existed": True,
                        "backup_path": backup_path
                    }
                else:
                    manifest["files"][rel_p] = {
                        "existed": False,
                        "backup_path": None
                    }

                with open(manifest_file, "w", encoding="utf-8") as mf:
                    json.dump(manifest, mf, ensure_ascii=False, indent=2)
        except Exception as e:
            pass

    print(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
