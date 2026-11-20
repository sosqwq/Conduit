#!/usr/bin/env python3
"""Verify that each fenced tutorial snippet copies contiguous, complete source lines."""
import re
import sys
from pathlib import Path

CHAPTERS = Path("frontend/src/tutorial/chapters")
SOURCE = re.compile(r"来源：`([^`]+)`")
FENCE = re.compile(r" {0,3}(`{3,}|~{3,})(.*)")


def verify_source(root, chapter, path, snippet):
    target = Path(path)
    source = (root / target).resolve()
    if target.is_absolute() or not source.is_relative_to(root) or source == chapter.resolve():
        return f"来源路径无效：{path}"
    if not any(line.strip() for line in snippet):
        return f"空片段：{path}"
    try:
        lines = source.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as error:
        return f"不能读取来源 {path}：{error}"
    for start, line in enumerate(lines):
        if line == snippet[0] and lines[start:start + len(snippet)] == snippet:
            return None
    return f"在 {path} 未找到连续的完整代码行（请核对缩进、空格与顺序）"


def check_chapter(root, chapter):
    lines = chapter.read_text(encoding="utf-8").splitlines()
    location = chapter.relative_to(root)
    errors = []
    count = 0
    previous = ""
    index = 0
    while index < len(lines):
        line = lines[index]
        index += 1
        opening = FENCE.fullmatch(line)
        if not opening:
            if line.strip():
                previous = line.strip()
            continue

        number = index
        fence = opening[1]
        closing = re.compile(r" {0,3}" + fence[0] + "{" + str(len(fence)) + r",}[ \t]*")
        while index < len(lines) and not closing.fullmatch(lines[index]):
            index += 1
        if index == len(lines):
            errors.append(f"{location}:{number} 代码块未闭合")
            break

        marker = SOURCE.fullmatch(previous)
        if marker:
            problem = verify_source(root, chapter, marker[1], lines[number:index])
        else:
            problem = "缺少来源，请在代码块前标注 来源：`仓库相对路径`"
        if problem:
            errors.append(f"{location}:{number} {problem}")
        else:
            count += 1
        previous = ""
        index += 1
    if count == 0 and not errors:
        errors.append(f"{location} 章节中没有代码片段")
    return count, errors


def check_chapters(root):
    root = root.resolve()
    chapters = sorted((root / CHAPTERS).glob("*.md"))
    if not chapters:
        return 0, [f"{CHAPTERS} 中没有教程章节"]
    expected = [f"{index:02d}" for index in range(10)]
    numbers = [chapter.name.partition("-")[0] for chapter in chapters]
    errors = []
    if numbers != expected:
        errors.append(f"章节编号应各出现一次（{', '.join(expected)}），实际为 {', '.join(numbers)}")
    total = 0
    for chapter in chapters:
        count, problems = check_chapter(root, chapter)
        total += count
        errors.extend(problems)
    return total, errors


if __name__ == "__main__":
    total, errors = check_chapters(Path(__file__).resolve().parents[1])
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    print(f"教程检查通过，共 {total} 个代码片段。")
