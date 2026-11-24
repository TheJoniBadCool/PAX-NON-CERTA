"""Run with: python3 tests/setup-defaults.py"""

from html.parser import HTMLParser
from pathlib import Path


class Controls(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inputs = {}
        self.buttons = {}
        self.selects = {}
        self.current_select = None

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "input":
            self.inputs.setdefault(attrs.get("id") or attrs.get("name"), []).append(attrs)
        elif tag == "button":
            self.buttons[attrs.get("id")] = attrs
        elif tag == "select":
            self.current_select = attrs["id"]
            self.selects[self.current_select] = []
        elif tag == "option" and self.current_select:
            self.selects[self.current_select].append(attrs)

    def handle_endtag(self, tag):
        if tag == "select":
            self.current_select = None


controls = Controls()
controls.feed(Path("PaxNonCerta.html").read_text())

for prefix in ("", "mp-"):
    for control, expected in {
        "board-size": "12",
        "fog-sight": "small",
        "resource-mode": "16",
        "resource-balance": "tiered",
        "resource-production-interval": "1",
        "planning-time-unit": "seconds",
        "starting-army": "default",
    }.items():
        options = controls.selects[prefix + control]
        selected = [option for option in options if "selected" in option]
        assert len(selected) == 1 and selected[0]["value"] == expected, (prefix, control)

    for control in ("show-resources-to-others", "planning-timer-enabled"):
        assert "checked" in controls.inputs[prefix + control][0], (prefix, control)
    duration = controls.inputs[prefix + "planning-time"][0]
    assert duration["value"] == "40" and "disabled" not in duration
    progression = controls.inputs["mp-progression" if prefix else "progression-mode"]
    assert [item["value"] for item in progression if "checked" in item] == ["zero"]

assert [item["value"] for item in controls.inputs["setup-mode"] if "checked" in item] == ["agreement"]
assert [item["value"] for item in controls.selects["mp-setup-mode"] if "selected" in item] == ["agreement"]
for button in ("btn-random-seed", "btn-mp-random-seed", "btn-custom-random-seed"):
    assert controls.buttons[button]["type"] == "button"

print("Hotseat and multiplayer setup defaults passed.")
