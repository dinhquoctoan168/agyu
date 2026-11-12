#!/usr/bin/env python3
"""
Deep Think 5 Level Manager for Antigravity Desktop (agyu).

Flow:
1. User provides a root task.
2. Level 1: Agent analyzes root task -> outputs up to 5 phases. State saved. Conversation closed.
3. Recursively for each phase (Levels 2 -> 5):
   - Opens a NEW conversation.
   - Reads task/objective of this phase with parent context.
   - If minimal/atomic (can execute directly) or level == 5: marks atomic, stops digging deeper.
   - If complex: breaks down into up to 5 sub-phases. State saved. Conversation closed.
4. Maximum 5 levels, maximum 5 phases per level. If tasks are small or atomic, terminates early.
"""

import os
import sys
import json
import time
import re
from datetime import datetime

class DeepThinkNode:
    def __init__(self, node_id, level, title, description="", parent_id=None, is_atomic=False, is_synthesis=False, depends_on=None, task_type="action", target_artifact="", contract=""):
        self.id = str(node_id)
        self.level = int(level)             # 0 for root, 1 to 5
        self.title = str(title).strip()
        self.description = str(description).strip()
        self.parent_id = str(parent_id) if parent_id is not None else None
        self.is_atomic = bool(is_atomic)
        self.is_synthesis = bool(is_synthesis)
        self.depends_on = list(depends_on) if depends_on else []
        self.task_type = str(task_type).lower() if task_type in ("action", "artifact") else "action"
        self.target_artifact = str(target_artifact).strip() if target_artifact else ""
        self.contract = str(contract).strip() if contract else ""
        self.status = "pending"             # pending, in_progress, completed, atomic, waiting_children, skipped, error
        self.conversation_id = None
        self.summary = ""
        self.children = []                  # list of child node IDs
        self.created_at = datetime.now().isoformat()
        self.updated_at = datetime.now().isoformat()

    def to_dict(self):
        return {
            "id": self.id,
            "level": self.level,
            "title": self.title,
            "description": self.description,
            "parent_id": self.parent_id,
            "is_atomic": self.is_atomic,
            "is_synthesis": self.is_synthesis,
            "depends_on": list(self.depends_on),
            "task_type": self.task_type,
            "target_artifact": self.target_artifact,
            "contract": self.contract,
            "status": self.status,
            "conversation_id": self.conversation_id,
            "summary": self.summary,
            "children": list(self.children),
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }

    @classmethod
    def from_dict(cls, data):
        node = cls(
            node_id=data.get("id"),
            level=data.get("level", 1),
            title=data.get("title", ""),
            description=data.get("description", ""),
            parent_id=data.get("parent_id"),
            is_atomic=data.get("is_atomic", False),
            is_synthesis=data.get("is_synthesis", False),
            depends_on=data.get("depends_on", []),
            task_type=data.get("task_type", "action"),
            target_artifact=data.get("target_artifact", ""),
            contract=data.get("contract", "")
        )
        node.status = data.get("status", "pending")
        node.conversation_id = data.get("conversation_id")
        node.summary = data.get("summary", "")
        node.children = list(data.get("children", []))
        node.created_at = data.get("created_at", datetime.now().isoformat())
        node.updated_at = data.get("updated_at", datetime.now().isoformat())
        return node


class DeepThinkManager:
    def __init__(self, target_dir, instance_id=None):
        self.target_dir = os.path.abspath(target_dir)
        self.instance_id = str(instance_id) if instance_id else None
        self.plans_dir = os.path.join(self.target_dir, ".agy_wrap", "deep_think_plans")
        os.makedirs(self.plans_dir, exist_ok=True)

        self.sessions_dir = os.path.join(self.target_dir, ".agy_wrap", "deep_think_sessions")
        os.makedirs(self.sessions_dir, exist_ok=True)

        self.is_active = False
        self.is_paused = False
        self.plan_id = None
        self.root_task = ""
        self.enable_synthesis = True
        self.max_levels = 5
        self.max_phases_per_level = 5

        self.nodes = {}             # node_id -> DeepThinkNode
        self.queue = []             # list of node_id to decompose
        self.current_node_id = None
        self.plan_file_path = None
        self.plan_md_path = None

        if self.instance_id:
            self.state_file_path = os.path.join(self.sessions_dir, f"{self.instance_id}.json")
        else:
            self.state_file_path = os.path.join(self.target_dir, ".agy_wrap", "deep_think_state.json")

        # Clean up legacy single-file state if present so old states do not bleed across instances
        legacy_state = os.path.join(self.target_dir, ".agy_wrap", "deep_think_state.json")
        if os.path.exists(legacy_state):
            try:
                os.remove(legacy_state)
            except Exception:
                pass

        # Only attempt to load state if this specific instance had a previous state file
        if os.path.exists(self.state_file_path):
            self._try_load_state()

    def cleanup(self):
        """Removes this instance's temporary session file upon exit."""
        if hasattr(self, 'state_file_path') and os.path.exists(self.state_file_path):
            try:
                os.remove(self.state_file_path)
            except Exception as e:
                print(f"[DeepThink cleanup Error] {e}", file=sys.stderr)

    def reset_session(self):
        """Resets the current instance deep think state to empty."""
        self.is_active = False
        self.is_paused = False
        self.plan_id = None
        self.root_task = ""
        self.nodes = {}
        self.queue = []
        self.current_node_id = None
        self.plan_file_path = None
        self.plan_md_path = None
        self.cleanup()
        return self.get_state()

    def _try_load_state(self):
        if not os.path.exists(self.state_file_path):
            return
        try:
            with open(self.state_file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.plan_id = data.get("plan_id")
            self.root_task = data.get("root_task", "")
            self.max_levels = data.get("max_levels", 5)
            self.enable_synthesis = data.get("enable_synthesis", True)
            self.is_active = data.get("is_active", False)
            self.is_paused = data.get("is_paused", False)
            self.current_node_id = data.get("current_node_id")
            self.queue = list(data.get("queue", []))

            self.nodes = {}
            for nid, ndata in data.get("nodes", {}).items():
                self.nodes[str(nid)] = DeepThinkNode.from_dict(ndata)

            if self.plan_id:
                self.plan_file_path = os.path.join(self.plans_dir, f"deep_think_{self.plan_id}.json")
                self.plan_md_path = os.path.join(self.plans_dir, f"DEEP_THINK_PLAN_{self.plan_id}.md")
        except Exception as e:
            print(f"[DeepThink _try_load_state Error] {e}", file=sys.stderr)

    def start_new_session(self, root_task, enable_synthesis=True, max_levels=5):
        """Starts a new deep think planning session with configurable max levels."""
        self.plan_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.root_task = str(root_task).strip()
        self.enable_synthesis = bool(enable_synthesis)
        try:
            self.max_levels = max(2, min(5, int(max_levels)))
        except (ValueError, TypeError):
            self.max_levels = 5
        self.is_active = True
        self.is_paused = False
        self.nodes = {}
        self.queue = []

        self.plan_file_path = os.path.join(self.plans_dir, f"deep_think_{self.plan_id}.json")
        self.plan_md_path = os.path.join(self.plans_dir, f"DEEP_THINK_PLAN_{self.plan_id}.md")

        # Root node (level 0)
        root_node = DeepThinkNode(
            node_id="root",
            level=0,
            title=self.root_task[:80] + ("..." if len(self.root_task) > 80 else ""),
            description=self.root_task,
            parent_id=None,
            is_atomic=False
        )
        self.nodes["root"] = root_node
        self.queue.append("root")
        self.current_node_id = None

        self.save_state()
        return self.get_state()

    def get_state(self):
        """Returns the current state dictionary for UI consumption."""
        nodes_dict = {nid: node.to_dict() for nid, node in self.nodes.items()}
        total_nodes = len(self.nodes)
        completed_nodes = sum(1 for n in self.nodes.values() if n.status in ("completed", "atomic"))
        atomic_nodes = sum(1 for n in self.nodes.values() if n.is_atomic)
        pending_nodes = len(self.queue)

        # Count nodes by level
        level_counts = {}
        for lvl in range(1, self.max_levels + 1):
            level_counts[lvl] = sum(1 for n in self.nodes.values() if n.level == lvl)

        current_node_data = self.nodes.get(self.current_node_id).to_dict() if self.current_node_id and self.current_node_id in self.nodes else None

        return {
            "plan_id": self.plan_id,
            "root_task": self.root_task,
            "enable_synthesis": getattr(self, "enable_synthesis", True),
            "max_levels": self.max_levels,
            "is_active": self.is_active,
            "is_paused": self.is_paused,
            "current_node_id": self.current_node_id,
            "current_node": current_node_data,
            "queue": list(self.queue),
            "queue_length": len(self.queue),
            "total_nodes": total_nodes,
            "completed_nodes": completed_nodes,
            "atomic_nodes": atomic_nodes,
            "pending_nodes": pending_nodes,
            "level_counts": level_counts,
            "nodes": nodes_dict,
            "plan_file_path": self.plan_file_path,
            "plan_md_path": self.plan_md_path
        }

    def _is_dependency_satisfied(self, dep_id, visited=None):
        """Recursively checks if a dependency (and all its children) has finished."""
        if visited is None:
            visited = set()
        dep_id_str = str(dep_id)
        if dep_id_str in visited:
            return True
        visited.add(dep_id_str)

        dep = self.nodes.get(dep_id_str)
        if not dep:
            return True
        if dep.status not in ("completed", "atomic", "skipped"):
            return False
        if dep.children:
            for cid in dep.children:
                if not self._is_dependency_satisfied(cid, visited):
                    return False
        return True

    def _is_node_ready(self, node_id):
        """Checks if a node is ready to run (all its declared dependencies are satisfied)."""
        node = self.nodes.get(str(node_id))
        if not node:
            return False
        if getattr(node, "is_synthesis", False):
            return node.status == "pending"
        for dep_id in getattr(node, "depends_on", []):
            if not self._is_dependency_satisfied(dep_id):
                return False
        return True

    def has_next_task(self):
        """Checks if there is a ready pending node in the queue."""
        self._check_and_activate_merge_nodes()
        if not self.is_active or self.is_paused or not self.queue:
            return False
        return any(self._is_node_ready(nid) for nid in self.queue)

    def get_next_prompt_and_node(self):
        """Pops next ready node from queue, marks in_progress, and returns (node, prompt)."""
        if not self.has_next_task():
            return None, None

        next_node_id = None
        for nid in self.queue:
            if self._is_node_ready(nid):
                next_node_id = nid
                break

        if not next_node_id:
            return None, None

        self.queue.remove(next_node_id)
        node = self.nodes.get(next_node_id)
        if not node:
            return None, None

        self.current_node_id = next_node_id
        node.status = "in_progress"
        node.updated_at = datetime.now().isoformat()
        self.save_state()

        prompt = self._build_prompt_for_node(node)
        return node, prompt

    def _get_ancestor_hierarchy(self, node):
        """Returns string representation of ancestry path."""
        parts = []
        curr = node
        while curr and curr.parent_id and curr.parent_id in self.nodes:
            curr = self.nodes[curr.parent_id]
            if curr.id != "root":
                parts.insert(0, f"Level {curr.level}: {curr.title}")
        return " > ".join(parts) if parts else "Gốc (Root Task)"

    def _build_prompt_for_node(self, node):
        """Generates standard prompt for agent decomposition or synthesis."""
        if getattr(node, "is_synthesis", False):
            parent_node = self.nodes.get(node.parent_id) if node.parent_id else None
            parent_title = parent_node.title if parent_node else self.root_task[:80]
            parent_desc = parent_node.description if parent_node else self.root_task

            children_details = []
            for dep_id in node.depends_on:
                dep_node = self.nodes.get(dep_id)
                if dep_node:
                    detail = f"- **{dep_node.title}**"
                    if dep_node.summary:
                        detail += f": {dep_node.summary}"
                    elif dep_node.description:
                        detail += f": {dep_node.description}"
                    children_details.append(detail)
            children_text = "\n".join(children_details) if children_details else "- Không có task thành phần."

            return f"""[CHẾ ĐỘ DEEP THINK - HỢP NHẤT KẾT QUẢ CỤM]
Bạn là một AI Architect đang thực hiện bước HỢP NHẤT & ĐỒNG BỘ KẾT QUẢ (Synthesis) cho một cụm nhiệm vụ trong mô hình Deep Think 5 Level.

BỐI CẢNH CỤM CHA:
- Tiêu đề: \"{parent_title}\"
- Mục tiêu: \"{parent_desc}\"

KẾT QUẢ TỪ CÁC CÔNG VIỆC CON TRONG CỤM ({len(children_details)} tasks):
{children_text}

YÊU CẦU:
1. Đọc và phân tích toàn diện kết quả của các công việc con ở trên.
2. Rà soát tính nhất quán, phát hiện và loại bỏ các điểm trùng lặp hoặc mâu thuẫn.
3. Hợp nhất thành một bản đúc kết tích hợp hoàn chỉnh cho toàn cụm này.
4. Trả về cấu trúc JSON trong khối ```json ... ```:
```json
{{
  "summary": "Tóm tắt kết quả tổng hợp tích hợp toàn bộ cụm",
  "is_atomic": true,
  "synthesis_result": "Chi tiết kết quả hợp nhất và các điểm mấu chốt của cụm"
}}
```
Ngoài khối JSON, bạn có thể kèm phần giải thích bằng tiếng Việt.
"""

        elif node.id == "root":
            # Level 1 decomposition prompt
            return f"""[CHẾ ĐỘ DEEP THINK - TẦNG 1/{self.max_levels}]
Bạn là một AI Architect đang thực hiện phân tích nhiệm vụ theo mô hình "Deep Think {self.max_levels} Level".
Nhiệm vụ gốc:
\"\"\"
{self.root_task}
\"\"\"

NGUYÊN TẮC QUAN TRỌNG VỀ PHẠM VI, ĐIỂM DỪNG & CHỐNG Ô NHIỄM NGỮ CẢNH:
1. Bám sát bản chất nhiệm vụ gốc: Nếu nhiệm vụ gốc là "Lập danh mục", "Đề xuất ý tưởng", "Soạn thảo khung/kế hoạch", hãy giữ đúng phạm vi này. TUYỆT ĐỐI KHÔNG tự ý phân rã sang các bước thực thi kỹ thuật chi tiết trừ khi đề bài gốc yêu cầu thực thi thực tế.
2. Tiêu chí Dừng (Atomic): Khi một nhánh đã đạt tới mức là một đề tài/hạng mục độc lập đáp ứng đúng yêu cầu đề bài, hãy đánh dấu `can_execute_directly`: true để dừng phân rã sớm, tránh chi tiết hóa quá mức.
3. Phân loại Tính chất Công việc (task_type) và Kết quả Đầu ra (target_artifact):
   - "action": Nhiệm vụ dạng hành động/quy trình/tra cứu (target_artifact để trống `""`).
   - "artifact": Nhiệm vụ có sản phẩm/kết quả hữu hình cụ thể (tạo/sửa file mã nguồn, tài liệu...). Trường `target_artifact` ghi rõ tên file (ví dụ: "docs/tieu_chuan.md").
4. QUY TẮC PHỤ THUỘC & CHỐNG Ô NHIỄM NGỮ CẢNH (depends_on & contract):
   - Mặc định: Để `depends_on`: [] để các Phase chạy độc lập, ngữ cảnh hoàn toàn sạch sẽ, tránh bị phân tâm bởi các task không liên quan.
   - Khi có quan hệ phụ thuộc tuần tự (ví dụ: Phase 1 thiết lập tiêu chuẩn/quy chuẩn chung, Phase 2-3 bắt buộc phải áp dụng quy chuẩn này):
     + Ở Phase đi trước: Điền trường `contract` tóm tắt quy chuẩn/giao ước cốt lõi cần chuyển giao (ngắn gọn 1-3 câu) hoặc xác định rõ `target_artifact`.
     + Ở Phase đi sau: Điền số thứ tự của Phase cần kế thừa vào `depends_on` (ví dụ: `depends_on: [1]`).
     + Hệ thống sẽ CHỈ truyền đúng `contract` và đường dẫn file của Phase được chỉ định sang cho Phase sau, tuyệt đối không truyền toàn bộ log hay ngữ cảnh thừa.

YÊU CẦU:
1. Phân tích cẩn thận mục tiêu và phạm vi của nhiệm vụ gốc.
2. Chia nhiệm vụ thành các Phase tuần tự (tối đa 5 Phase; nếu nhiệm vụ đơn giản thì chia ít hơn, ví dụ 2-3 Phase).
3. Đánh giá xem từng Phase thuộc loại "action" hay "artifact", xác định kết quả đầu ra nếu có.
4. Xác định quan hệ phụ thuộc (`depends_on`) và giao ước chia sẻ (`contract`) nếu có để đảm bảo chống ô nhiễm ngữ cảnh.
5. Đánh giá xem từng Phase đã tối giản và có thể bắt tay vào làm được ngay (atomic) hay cần tiếp tục đào sâu ở các tầng sau.
6. Đánh giá xem cụm Phase này có cần thêm một bước hợp nhất kết quả ở cuối cụm không (needs_synthesis).
7. Trả về kết quả dưới dạng một khối JSON hợp lệ theo đúng định dạng sau:
```json
{{
  "summary": "Tóm tắt định hướng phân chia nhiệm vụ ở Tầng 1",
  "is_atomic": false,
  "needs_synthesis": false,
  "phases": [
    {{
      "title": "Tên Phase ngắn gọn",
      "description": "Mô tả mục tiêu, yêu cầu và cách thực hiện của Phase này",
      "task_type": "artifact",
      "target_artifact": "docs/tieu_chuan.md",
      "depends_on": [],
      "contract": "Tiêu chuẩn kỹ thuật hoặc giao ước cốt lõi cần chia sẻ (nếu có)",
      "can_execute_directly": false
    }}
  ]
}}
```
Lưu ý quan trọng:
- Danh sách `phases` tối đa 5 phần tử.
- `task_type`: `"action"` hoặc `"artifact"`.
- `target_artifact`: tên file hoặc mô tả kết quả cụ thể (nếu task_type là `"action"` thì để `""`).
- `depends_on`: danh sách số thứ tự Phase cần kế thừa (ví dụ `[1]` nếu phụ thuộc Phase 1, hoặc `[]` nếu độc lập).
- `contract`: tóm tắt tiêu chuẩn/giao ước cần truyền cho các phase phụ thuộc phía sau (để trống `""` nếu không có).
- `can_execute_directly`: đặt là `true` nếu phase này đã quá tối giản, làm được ngay không cần chia nhỏ thêm.
- `is_atomic`: đặt là `true` nếu toàn bộ nhiệm vụ này đã quá đơn giản không cần chia phase.
- `needs_synthesis`: đặt là `true` nếu các phase này có liên kết chặt chẽ và cần thêm một bước hợp nhất kết quả sau khi các phase hoàn thành; đặt là `false` nếu các phase độc lập hoặc bản thân đã có phase đánh giá/tổng hợp riêng.
- Ngoài khối JSON, bạn có thể kèm theo phần giải thích ngắn gọn bằng tiếng Việt.
"""
        else:
            target_level = node.level + 1
            hierarchy = self._get_ancestor_hierarchy(node)
            is_last_level = (target_level >= self.max_levels)

            last_level_hint = ""
            if is_last_level:
                last_level_hint = f"\n(LƯU Ý: Đây là TẦNG {target_level}/{self.max_levels} - Tầng tối đa của phiên phân rã này. Mọi sub-phase chia ra ở tầng này bắt buộc là tầng lá cuối cùng và phải ở mức tối giản làm được ngay - can_execute_directly: true)."

            curr_type = getattr(node, 'task_type', 'action')
            curr_artifact = getattr(node, 'target_artifact', '') or 'Không có'

            dependency_section = ""
            if getattr(node, "depends_on", None):
                dep_lines = []
                for dep_id in node.depends_on:
                    dep_node = self.nodes.get(str(dep_id))
                    if dep_node:
                        items = []
                        if getattr(dep_node, "contract", ""):
                            items.append(f"Giao ước/Tiêu chuẩn: {dep_node.contract}")
                        elif dep_node.summary:
                            items.append(f"Kết quả chính: {dep_node.summary[:200]}")
                        if getattr(dep_node, "target_artifact", ""):
                            items.append(f"Tệp sản phẩm liên quan: `{dep_node.target_artifact}` (Có thể đọc tệp này qua công cụ nếu cần chi tiết)")

                        if items:
                            desc = "; ".join(items)
                            dep_lines.append(f"- **{dep_node.title}** (Node {dep_node.id}): {desc}")
                        else:
                            dep_lines.append(f"- **{dep_node.title}** (Node {dep_node.id}): Đã hoàn tất")

                if dep_lines:
                    dependency_section = f"""

TIÊU CHUẨN / KẾT QUẢ KẾ THỪA TỪ CÁC BƯỚC PHỤ THUỘC (CHỐNG Ô NHIỄM NGỮ CẢNH):
(Chỉ tập trung áp dụng các tiêu chuẩn/kết quả dưới đây, không nạp ngữ cảnh ngoài lề):
{chr(10).join(dep_lines)}"""

            return f"""[CHẾ ĐỘ DEEP THINK - TẦNG {target_level}/{self.max_levels}]
Bạn đang tiếp tục phân tích sâu cho một Phase trong kế hoạch Deep Think {self.max_levels} Level.

BỐI CẢNH TỔNG THỂ:
- Nhiệm vụ gốc: \"{self.root_task}\"
- Nhánh phân cấp cha: \"{hierarchy}\"

NHIỆM VỤ CỦA PHASE HIỆN TẠI (Đang ở Tầng {node.level}):
- Tiêu đề: \"{node.title}\"
- Mô tả: \"{node.description}\"
- Tính chất: \"{curr_type}\" (Sản phẩm: \"{curr_artifact}\"){dependency_section}{last_level_hint}

NGUYÊN TẮC QUAN TRỌNG VỀ PHẠM VI, ĐIỂM DỪNG & CHỐNG Ô NHIỄM NGỮ CẢNH:
1. Bám sát bản chất nhiệm vụ gốc và áp dụng đúng tiêu chuẩn kế thừa (nếu có ở trên).
2. Khi Phase hiện tại đã là một đầu việc/đề án/sản phẩm cụ thể và rõ ràng, BẮT BUỘC đặt `is_atomic`: true, `can_execute_directly`: true, `phases`: [] để DỪNG PHÂN RÃ NGAY LẬP TỨC.
3. Phân biệt rõ 2 tính chất công việc ("action" hoặc "artifact").
4. Quản lý phụ thuộc có chọn lọc: Nếu chia thành các sub-phase, chỉ đặt `depends_on` khi sub-phase sau thực sự cần kết quả/tiêu chuẩn từ sub-phase trước. Mặc định để `depends_on: []` để tránh ô nhiễm ngữ cảnh.

YÊU CẦU:
1. Đọc và phân tích kỹ nhiệm vụ của Phase hiện tại.
2. Kiểm tra xem nhiệm vụ này đã ở mức tối giản, rõ ràng và có thể bắt tay vào thực hiện được ngay chưa.
   - Nếu ĐÃ ĐỦ TỐI GIẢN (làm được ngay, không cần chia nhỏ thêm):
     Đặt `is_atomic`: true, `can_execute_directly`: true, mảng `phases`: [].
   - Nếu VẪN CẦN CHIA NHỎ:
     Chia Phase này thành tối đa 5 sub-phase tiếp theo (tối đa 5; nếu ít việc thì chia ít hơn).
3. Đánh giá xem cụm sub-phase này có cần bước hợp nhất kết quả lại không (`needs_synthesis`: true/false).
4. Trả về cấu trúc JSON trong khối ```json ... ```:
```json
{{
  "summary": "Đánh giá ngắn gọn về Phase này",
  "is_atomic": false,
  "needs_synthesis": false,
  "phases": [
    {{
      "title": "Tên sub-phase",
      "description": "Mô tả chi tiết mục tiêu và cách thực hiện",
      "task_type": "artifact",
      "target_artifact": "tên_file_hoặc_để_trống",
      "depends_on": [],
      "contract": "Tiêu chuẩn hoặc giao ước đầu ra ngắn gọn (nếu có)",
      "can_execute_directly": {"true" if is_last_level else "false"}
    }}
  ]
}}
```
Lưu ý:
- `task_type`: `"action"` hoặc `"artifact"`.
- `target_artifact`: tên file cụ thể nếu là artifact, để `""` nếu là action.
- `depends_on`: danh sách số thứ tự sub-phase cần kế thừa (ví dụ `[1]` hoặc `[]`).
- `contract`: giao ước/tiêu chuẩn đầu ra ngắn gọn bàn giao cho các sub-phase phía sau (để trống `""` nếu không có).
- Đặt `needs_synthesis`: true nếu các sub-phase cần hợp nhất lại thành một sản phẩm chung; đặt `false` nếu độc lập hoặc đã có bước tổng hợp riêng.
"""

    def parse_agent_response(self, text):
        """Extracts JSON structured plan from agent output."""
        if not text:
            return None

        def extract_balanced_json_candidates(s):
            candidates = []
            # 1. First look inside markdown code blocks ```json ... ``` or ``` ... ```
            code_blocks = re.findall(r"```(?:json)?\s*([\s\S]*?)\s*```", s)
            for block in code_blocks:
                b = block.strip()
                if b.startswith("{") and b.endswith("}"):
                    candidates.append(b)

            # 2. Balanced brace scan in the entire text to capture any complete { ... }
            start = 0
            while True:
                idx = s.find("{", start)
                if idx == -1:
                    break
                depth = 0
                in_string = False
                escape = False
                end = -1
                for i in range(idx, len(s)):
                    c = s[i]
                    if escape:
                        escape = False
                        continue
                    if c == "\\":
                        escape = True
                        continue
                    if c == '"':
                        in_string = not in_string
                        continue
                    if not in_string:
                        if c == "{":
                            depth += 1
                        elif c == "}":
                            depth -= 1
                            if depth == 0:
                                end = i
                                break
                if end != -1:
                    cand = s[idx:end + 1].strip()
                    if cand not in candidates:
                        candidates.append(cand)
                    start = idx + 1
                else:
                    break
            return candidates

        def try_parse_candidate(cand_str):
            try:
                data = json.loads(cand_str)
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
            cleaned = re.sub(r",\s*([\]}])", r"\1", cand_str)
            try:
                data = json.loads(cleaned)
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
            return None

        # 1. Try JSON candidates
        candidates = extract_balanced_json_candidates(text)
        for cand in candidates:
            parsed = try_parse_candidate(cand)
            if parsed and isinstance(parsed, dict):
                if "phases" in parsed or "is_atomic" in parsed:
                    if "phases" in parsed and not isinstance(parsed["phases"], list):
                        parsed["phases"] = []
                    return parsed

        # 2. Fallback: Parse markdown list of phases
        lines = text.splitlines()
        phases = []

        has_negative_atomic = bool(re.search(
            r'(?:"is_atomic"\s*:\s*false|is_atomic\s*:\s*false|không\s+(?:phải\s+)?tối\s+giản|chưa\s+(?:phải\s+)?tối\s+giản|chưa\s+atomic)',
            text, re.IGNORECASE
        ))
        has_positive_atomic = bool(re.search(
            r'(?:"is_atomic"\s*:\s*true|is_atomic\s*:\s*true|đã\s+tối\s+giản|hoàn\s+thành\s+tối\s+giản|không\s+cần\s+chia\s+nhỏ)',
            text, re.IGNORECASE
        ))

        current_phase = None
        for line in lines:
            line_s = line.strip()
            if not line_s:
                continue
            if re.match(r"^#{1,6}\s+(?!Phase\b)", line_s, re.IGNORECASE):
                continue

            m = re.match(r"^(?:[-*•#\s]*)(?:(?:Phase\s*\d+|\d+)[.:\s-]+)\s*(.+)$", line_s, re.IGNORECASE)
            if m and len(phases) < self.max_phases_per_level:
                raw_title = m.group(1).strip()
                clean_title = re.sub(r"^\*+|\*+$", "", raw_title).strip(" :•-")
                if clean_title:
                    current_phase = {
                        "title": clean_title,
                        "description": "",
                        "task_type": "action",
                        "target_artifact": "",
                        "can_execute_directly": False
                    }
                    phases.append(current_phase)
            elif current_phase and (line_s.startswith(("-", "*", "•")) or line.startswith("  ")):
                desc_line = line_s.lstrip("-*• ").strip()
                if desc_line:
                    current_phase["description"] = (current_phase["description"] + " " + desc_line).strip()

        is_atomic = (len(phases) == 0) and has_positive_atomic and (not has_negative_atomic)

        if phases or is_atomic:
            return {
                "summary": "Tự động phân tích từ phản hồi dạng văn bản",
                "is_atomic": is_atomic,
                "phases": phases[:self.max_phases_per_level]
            }

        return None

    def process_turn_result(self, content, conversation_id):
        """Processes agent output for the current node and updates the plan tree."""
        if not self.current_node_id or self.current_node_id not in self.nodes:
            return False, "Không có node hiện tại đang xử lý."

        curr_node = self.nodes[self.current_node_id]
        curr_node.conversation_id = conversation_id
        curr_node.updated_at = datetime.now().isoformat()

        parsed = self.parse_agent_response(content)
        if not parsed:
            if curr_node.id == "root":
                return False, "Không thể trích xuất cấu trúc Phase từ phản hồi của AI cho nhiệm vụ gốc."
            # If parsing completely failed for child node, treat current node as atomic leaf so we do not get stuck
            curr_node.status = "atomic"
            curr_node.is_atomic = True
            curr_node.summary = "Đã phân tích (không chia thêm phase)."
            self.save_state()
            self._check_and_activate_merge_nodes()
            self._check_if_completed()
            return True, "Không phát hiện thêm phase con, đánh dấu hoàn tất."

        # Handle synthesis node result
        if getattr(curr_node, "is_synthesis", False):
            curr_node.status = "completed"
            curr_node.is_atomic = True
            curr_node.summary = parsed.get("summary", "") or parsed.get("synthesis_result", "") or "Đã hoàn thành hợp nhất cụm."
            if curr_node.parent_id and curr_node.parent_id in self.nodes:
                parent = self.nodes[curr_node.parent_id]
                parent.summary = f"[Tổng hợp cụm]: {curr_node.summary}"
            self.current_node_id = None
            self.save_state()
            self._check_and_activate_merge_nodes()
            self._check_if_completed()
            return True, f"Đã hoàn thành bước hợp nhất cụm: {curr_node.title}."

        curr_node.summary = parsed.get("summary", "")
        if "contract" in parsed and parsed.get("contract"):
            curr_node.contract = str(parsed.get("contract")).strip()
        is_atomic = parsed.get("is_atomic", False)
        raw_phases = parsed.get("phases", [])
        needs_synthesis = parsed.get("needs_synthesis", False) and getattr(self, "enable_synthesis", True)

        # Filter and cap to max 5 phases
        phases = raw_phases[:self.max_phases_per_level]

        # Target level for children
        child_level = curr_node.level + 1

        if is_atomic or len(phases) == 0:
            curr_node.is_atomic = True
            curr_node.status = "atomic"
            self.current_node_id = None
            self.save_state()
            self._check_and_activate_merge_nodes()
            self._check_if_completed()
            return True, f"Phase {curr_node.title} được đánh giá là tối giản (atomic)."

        # Create child nodes
        curr_node.status = "completed"
        created_child_ids = []

        for idx, p in enumerate(phases, start=1):
            title = p.get("title", f"Phase {idx}").strip()
            desc = p.get("description", "").strip()
            can_execute = p.get("can_execute_directly", False) or (child_level >= self.max_levels)

            raw_task_type = str(p.get("task_type", "action")).strip().lower()
            task_type = "artifact" if raw_task_type in ("artifact", "result", "file", "kết quả", "san_pham") else "action"
            target_artifact = str(p.get("target_artifact", "")).strip()
            contract = str(p.get("contract", "")).strip()

            if curr_node.id == "root":
                child_id = str(idx)
            else:
                child_id = f"{curr_node.id}.{idx}"

            raw_deps = p.get("depends_on", [])
            if not isinstance(raw_deps, list):
                if isinstance(raw_deps, (int, str)):
                    raw_deps = [raw_deps]
                else:
                    raw_deps = []

            clean_deps = []
            for dep in raw_deps:
                dep_str = str(dep).strip()
                if not dep_str:
                    continue
                if dep_str in self.nodes:
                    clean_deps.append(dep_str)
                    continue
                if dep_str.isdigit():
                    rel_id = f"{curr_node.id}.{dep_str}" if curr_node.id != "root" else dep_str
                    clean_deps.append(rel_id)
                    continue
                m_dep = re.search(r"(\d+(?:\.\d+)?)", dep_str)
                if m_dep:
                    num_str = m_dep.group(1)
                    if num_str in self.nodes:
                        clean_deps.append(num_str)
                    elif curr_node.id != "root":
                        clean_deps.append(f"{curr_node.id}.{num_str}")
                    else:
                        clean_deps.append(num_str)
                else:
                    matched_id = None
                    for nid, n in self.nodes.items():
                        if n.title.lower() == dep_str.lower() or n.title.lower().startswith(dep_str.lower()):
                            matched_id = nid
                            break
                    if matched_id:
                        clean_deps.append(matched_id)
                    else:
                        clean_deps.append(dep_str)

            child_node = DeepThinkNode(
                node_id=child_id,
                level=child_level,
                title=title,
                description=desc,
                parent_id=curr_node.id,
                is_atomic=bool(can_execute),
                depends_on=clean_deps,
                task_type=task_type,
                target_artifact=target_artifact,
                contract=contract
            )

            if can_execute:
                child_node.status = "atomic"
            else:
                child_node.status = "pending"
                if child_level < self.max_levels:
                    self.queue.append(child_id)

            self.nodes[child_id] = child_node
            created_child_ids.append(child_id)

        # Cluster merge node if needs_synthesis and > 1 children
        if needs_synthesis and len(created_child_ids) > 1:
            merge_id = f"{curr_node.id}.merge"
            clean_parent_title = curr_node.title[:40] if curr_node.id != "root" else "Nhiệm vụ gốc"
            merge_node = DeepThinkNode(
                node_id=merge_id,
                level=child_level,
                title=f"Hợp nhất: {clean_parent_title}",
                description=f"Hợp nhất và rà soát kết quả từ {len(created_child_ids)} nhiệm vụ thành phần trong cụm.",
                parent_id=curr_node.id,
                is_atomic=False,
                is_synthesis=True,
                depends_on=list(created_child_ids),
                task_type="artifact",
                target_artifact="Báo cáo hợp nhất cụm"
            )
            # Check if all children are already atomic/done
            all_done = all(self.nodes[c].status in ("completed", "atomic", "skipped") for c in created_child_ids)
            if all_done:
                merge_node.status = "pending"
                self.queue.append(merge_id)
            else:
                merge_node.status = "waiting_children"

            self.nodes[merge_id] = merge_node
            created_child_ids.append(merge_id)

        curr_node.children = created_child_ids
        self.current_node_id = None
        self.save_state()
        self._check_and_activate_merge_nodes()
        self._check_if_completed()

        return True, f"Đã chia {len(created_child_ids)} sub-phases ở Tầng {child_level}."

    def _check_and_activate_merge_nodes(self):
        """Activates any waiting synthesis nodes whose dependencies are all completed or atomic."""
        for nid, node in self.nodes.items():
            if getattr(node, "is_synthesis", False) and node.status == "waiting_children":
                all_done = True
                for dep_id in node.depends_on:
                    dep = self.nodes.get(dep_id)
                    if not dep or dep.status not in ("completed", "atomic", "skipped"):
                        all_done = False
                        break
                if all_done:
                    node.status = "pending"
                    if node.id not in self.queue:
                        self.queue.append(node.id)

    def skip_node(self, node_id):
        """Skips a node (e.g. an unnecessary synthesis node)."""
        node = self.nodes.get(str(node_id))
        if not node:
            return self.get_state()

        node.status = "skipped"
        node.updated_at = datetime.now().isoformat()
        if str(node_id) in self.queue:
            self.queue.remove(str(node_id))
        if self.current_node_id == str(node_id):
            self.current_node_id = None

        self._check_and_activate_merge_nodes()
        self._check_if_completed()
        self.save_state()
        return self.get_state()

    def mark_node_atomic(self, node_id):
        """Forces a node to become an atomic leaf, stopping any further decomposition of this branch."""
        node = self.nodes.get(str(node_id))
        if not node:
            return self.get_state()

        node.is_atomic = True
        node.status = "atomic"
        node.updated_at = datetime.now().isoformat()

        # Remove this node and any of its descendants from queue
        to_remove = set()
        queue_check = [str(node_id)]
        while queue_check:
            curr = queue_check.pop(0)
            to_remove.add(curr)
            curr_n = self.nodes.get(curr)
            if curr_n and curr_n.children:
                queue_check.extend(curr_n.children)

        self.queue = [nid for nid in self.queue if nid not in to_remove]
        if self.current_node_id in to_remove:
            self.current_node_id = None

        self._check_and_activate_merge_nodes()
        self._check_if_completed()
        self.save_state()
        return self.get_state()

    def _check_if_completed(self):
        """Checks if all nodes are completed or atomic, marks session complete."""
        has_waiting = any(getattr(n, "is_synthesis", False) and n.status == "waiting_children" for n in self.nodes.values())
        if len(self.queue) == 0 and not has_waiting and not self.current_node_id:
            self.is_active = False
            self.current_node_id = None
            self.save_state()

    def pause(self):
        """Pauses the deep think process."""
        self.is_paused = True
        self.save_state()

    def resume(self):
        """Resumes the deep think process."""
        self.is_paused = False
        self.save_state()

    def stop(self):
        """Stops the deep think process and saves final state."""
        self.is_active = False
        self.is_paused = False
        self.queue = []
        self.save_state()

    def save_state(self):
        """Persists the full tree to JSON and generates the markdown summary."""
        state_data = {
            "plan_id": self.plan_id,
            "root_task": self.root_task,
            "enable_synthesis": getattr(self, "enable_synthesis", True),
            "is_active": self.is_active,
            "is_paused": self.is_paused,
            "current_node_id": self.current_node_id,
            "queue": list(self.queue),
            "max_levels": self.max_levels,
            "nodes": {nid: node.to_dict() for nid, node in self.nodes.items()},
            "updated_at": datetime.now().isoformat()
        }

        # 1. Write active state file
        try:
            with open(self.state_file_path, "w", encoding="utf-8") as f:
                json.dump(state_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[DeepThink save_state JSON Error] {e}", file=sys.stderr)

        # 2. Write archive plan file
        if self.plan_file_path:
            try:
                with open(self.plan_file_path, "w", encoding="utf-8") as f:
                    json.dump(state_data, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        # 3. Generate readable Markdown report
        if self.plan_md_path:
            try:
                self._generate_markdown_report()
            except Exception as e:
                print(f"[DeepThink generate_markdown Error] {e}", file=sys.stderr)

    def _generate_markdown_report(self):
        """Generates an aesthetic Markdown document detailing the 5-level hierarchy."""
        total_nodes = len(self.nodes)
        atomic_nodes = sum(1 for n in self.nodes.values() if n.is_atomic)
        status_text = "Hoàn tất" if not self.is_active else ("Tạm dừng" if self.is_paused else "Đang thực thi")

        md_lines = [
            f"# Kế hoạch Deep Think 5 Level",
            f"",
            f"- **Nhiệm vụ gốc:** {self.root_task}",
            f"- **Mã kế hoạch:** `{self.plan_id}`",
            f"- **Trạng thái:** `{status_text}`",
            f"- **Tổng số node:** {total_nodes} (Node tối giản: {atomic_nodes})",
            f"- **Cập nhật lúc:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"",
            f"---",
            f"",
            f"## Cấu trúc cây phân cấp (Tối đa 5 tầng)",
            f""
        ]

        def render_node(node_id, indent_level):
            node = self.nodes.get(node_id)
            if not node or node.id == "root":
                return

            indent = "  " * (indent_level - 1)
            if getattr(node, "is_synthesis", False):
                icon = "🔄"
                tag = " `[HỢP NHẤT CỤM]`"
            elif node.status == "skipped":
                icon = "⏭"
                tag = " `[ĐÃ BỎ QUA]`"
            elif node.is_atomic:
                icon = "✅"
                tag = " `[TỐI GIẢN - LÀM NGAY]`"
            elif node.status == "in_progress":
                icon = "⏳"
                tag = ""
            else:
                icon = "🔹"
                tag = ""

            type_tag = ""
            if getattr(node, "task_type", "action") == "artifact":
                target = getattr(node, "target_artifact", "")
                type_tag = f" `[📁 Kết quả: {target}]`" if target else " `[📁 Kết quả (File)]`"
            else:
                type_tag = " `[🔍 Hành động]`"

            deps_tag = ""
            if getattr(node, "depends_on", None) and not getattr(node, "is_synthesis", False):
                deps_tag = f" `[Phụ thuộc: {', '.join(node.depends_on)}]`"

            conv_tag = f" *(Conv: `{node.conversation_id[:8]}...`)*" if node.conversation_id else ""

            md_lines.append(f"{indent}- {icon} **[Tầng {node.level}] {node.title}**{type_tag}{deps_tag}{tag}{conv_tag}")
            if node.description:
                md_lines.append(f"{indent}  > {node.description}")
            if getattr(node, "contract", ""):
                md_lines.append(f"{indent}  > 📋 **Giao ước/Tiêu chuẩn:** {node.contract}")

            for cid in node.children:
                render_node(cid, indent_level + 1)

        # Render starting from level 1 nodes (children of root)
        root = self.nodes.get("root")
        if root:
            for cid in root.children:
                render_node(cid, 1)

        with open(self.plan_md_path, "w", encoding="utf-8") as f:
            f.write("\n".join(md_lines) + "\n")
