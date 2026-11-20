import tempfile
import unittest
from pathlib import Path

from check_snippets import check_chapters


class ChapterSnippetsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.chapters = self.root / "frontend/src/tutorial/chapters"
        self.chapters.mkdir(parents=True)
        self.chapter = self.chapters / "00-test.md"
        self.source = self.root / "Example.java"
        self.source.write_bytes(b"class Example {\r\n    int count;\r\n}\r\n")

    def check(self, markdown):
        self.chapter.write_text(markdown, encoding="utf-8")
        count, errors = check_chapters(self.root)
        return count, "\n".join(errors)

    def test_matches_whole_source_lines_with_crlf(self):
        count, errors = self.check("来源：`Example.java`\n\n```java\n    int count;\n}\n```")
        self.assertEqual(1, count)
        self.assertEqual("", errors)

    def test_rejects_partial_lines_wrong_whitespace_and_noncontiguous_lines(self):
        for snippet in ("int count;", "    int count", "class Example {\n}", "    int count; "):
            with self.subTest(snippet=snippet):
                _, errors = self.check(f"来源：`Example.java`\n```java\n{snippet}\n```")
                self.assertIn("未找到连续的完整代码行", errors)
                self.assertIn("00-test.md:2", errors)

    def test_fails_if_any_block_has_no_source(self):
        _, errors = self.check("来源：`Example.java`\n```java\n}\n```\n~~~sql\n}\n~~~")
        self.assertIn("00-test.md:5", errors)
        self.assertIn("缺少来源", errors)

    def test_requires_a_real_source_in_repository(self):
        for path in ("missing.java", "../outside", str(self.source), "frontend/src/tutorial/chapters/00-test.md"):
            with self.subTest(path=path):
                _, errors = self.check(f"来源：`{path}`\n```java\n}}\n```")
                self.assertIn(path, errors)
                self.assertTrue(errors)

    def test_empty_block_and_unclosed_block_are_rejected(self):
        for block, error in [("```java\n\n```", "空片段"), ("```java\n}", "未闭合")]:
            with self.subTest(block=block):
                _, errors = self.check(f"来源：`Example.java`\n{block}")
                self.assertIn(error, errors)

    def test_checks_all_chapters_and_reports_missing_chapters(self):
        _, errors = check_chapters(self.root)
        self.assertTrue(errors)
        self.chapter.with_name("01-test.md").write_text("# chapter", encoding="utf-8")
        count, errors = self.check("来源：`Example.java`\n~~~~java\n}\n~~~~")
        self.assertEqual(1, count)
        self.assertIn("01-test.md", errors)
        self.assertNotIn("00-test.md", errors)

    def test_requires_every_chapter_even_if_a_duplicate_keeps_the_file_count_at_ten(self):
        example = "来源：`Example.java`\n```java\n}\n```"
        for index in range(10):
            (self.chapters / f"{index:02d}-test.md").write_text(example, encoding="utf-8")
        self.assertEqual(check_chapters(self.root), (10, []))
        (self.chapters / "05-test.md").rename(self.chapters / "07-extra.md")
        count, errors = check_chapters(self.root)
        self.assertEqual(count, 10)
        self.assertTrue(any("05" in problem and "07" in problem for problem in errors))


if __name__ == "__main__":
    unittest.main()
