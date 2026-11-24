#!/usr/bin/env python3
"""Run with: python3 tests/dashboard-layout.py"""

from html.parser import HTMLParser
from pathlib import Path


class DashboardParser(HTMLParser):
    void_tags = {"area", "base", "br", "col", "embed", "hr", "img", "input",
                 "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__()
        self.stack = []
        self.nodes = []

    def handle_starttag(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "parent": self.stack[-1] if self.stack else None}
        self.nodes.append(node)
        if tag not in self.void_tags:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.void_tags:
            self.stack.pop()

    def handle_endtag(self, tag):
        assert self.stack and self.stack[-1]["tag"] == tag, f"Unexpected closing {tag}"
        self.stack.pop()


parser = DashboardParser()
parser.feed(Path("PaxNonCerta.html").read_text())


def by_class(name):
    return next(node for node in parser.nodes if name in node["attrs"].get("class", "").split())


def by_id(name):
    matches = [node for node in parser.nodes if node["attrs"].get("id") == name]
    assert len(matches) == 1, f"Expected exactly one {name}"
    return matches[0]


dashboard = by_class("board-dashboard")
top = by_class("board-top-controls")
board = by_class("board-wrapper")
cards = by_class("player-cards")
assert [node for node in parser.nodes if node["parent"] is dashboard] == [
    top, board, by_id("purchase-requirements"), cards
]
assert by_id("objectives-panel")["parent"] is by_class("board-objectives")
assert by_class("board-objectives")["parent"] is top
sections = by_class("objectives-sections")
assert sections["parent"] is by_id("objectives-panel")
assert by_id("objectives-list")["parent"]["parent"]["parent"] is sections
assert by_id("temporary-objectives-panel")["parent"] is sections
actions = by_class("plan-actions")
assert actions["parent"] is top
assert by_id("round-clock")["parent"] is actions
controls = by_class("plan-controls")
assert controls["parent"] is actions
assert [by_id(name)["parent"] for name in ("round-clock-status", "planning-countdown", "btn-finish-plan", "btn-clear-plan")] == [controls] * 4
assert [node["attrs"]["id"] for node in parser.nodes if node["parent"] is cards] == [
    "card-p1", "card-p2", "card-p3", "card-p4"
]
for player in range(1, 5):
    shop = by_id(f"resource-purchases-p{player}")
    group = shop["parent"]
    assert group["attrs"].get("class") == "player-purchase-actions"
    assert group["parent"]["attrs"].get("class") == "player-card-heading"
    assert group["parent"]["parent"] is by_id(f"card-p{player}")
styles = Path("styles.css").read_text()
assert "flex: 0 0 auto;" in styles.split(".player-purchase-actions {", 1)[1].split("}", 1)[0]
assert "hidden" in by_id("objectives-panel")["attrs"]["class"].split()
print("Dashboard layout checks passed.")
