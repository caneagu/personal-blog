from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path

import app as app_module


class AmaFeatureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.ama_path = Path(self.tmpdir.name) / "ama.md"
        app_module.app.config["TESTING"] = True
        app_module.app.config["AMA_PATH"] = self.ama_path
        app_module.AMA_STATE_CACHE["stamp"] = None
        app_module.AMA_STATE_CACHE["state"] = {"next_id": 1, "questions": []}
        self.client = app_module.app.test_client()

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def csrf_token(self) -> str:
        response = self.client.get("/ama")
        self.assertEqual(response.status_code, 200)
        match = re.search(r'name="csrf_token" value="([^"]+)"', response.get_data(as_text=True))
        self.assertIsNotNone(match)
        return match.group(1)

    def ask_question(self, question: str, email: str):
        return self.client.post(
            "/ask",
            data={
                "csrf_token": self.csrf_token(),
                "question": question,
                "email": email,
            },
            follow_redirects=False,
        )

    def vote_question(self, question_id: str, email: str, vote: int):
        return self.client.post(
            f"/ask/{question_id}/vote",
            data={
                "csrf_token": self.csrf_token(),
                "email": email,
                "vote": str(vote),
            },
            follow_redirects=False,
        )

    def test_home_does_not_render_ama_section(self) -> None:
        response = self.client.get("/")
        body = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Ask Me Anything", body)
        self.assertNotIn('data-ama-question-form', body)
        self.assertIn('href="/ama"', body)

    def test_ama_page_renders_ama_section(self) -> None:
        response = self.client.get("/ama")
        body = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn("Ask Me Anything", body)
        self.assertIn('data-ama-question-form', body)

    def test_question_submission_rejects_invalid_email(self) -> None:
        response = self.ask_question("What should I focus on next?", "not-an-email")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.ama_path.exists())

    def test_question_submission_persists_to_markdown_file(self) -> None:
        response = self.ask_question("What should I focus on next?", "person@example.com")
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.headers["Location"].endswith("/ama#ask-me-anything"))
        questions = app_module.get_ama_questions()
        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0].question, "What should I focus on next?")
        self.assertTrue(self.ama_path.exists())
        self.assertIn("What should I focus on next?", self.ama_path.read_text(encoding="utf-8"))

    def test_vote_updates_score_and_allows_vote_change(self) -> None:
        self.ask_question("How should I prioritize roadmap requests?", "person@example.com")
        question = app_module.get_ama_questions()[0]

        response = self.vote_question(question.id, "voter@example.com", 1)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.headers["Location"].endswith(f"/ama#question-{question.id}"))
        question = app_module.get_ama_questions()[0]
        self.assertEqual(question.score, 1)
        self.assertEqual(question.upvotes, 1)
        self.assertEqual(question.downvotes, 0)

        response = self.vote_question(question.id, "voter@example.com", -1)
        self.assertEqual(response.status_code, 302)
        question = app_module.get_ama_questions()[0]
        self.assertEqual(question.score, -1)
        self.assertEqual(question.upvotes, 0)
        self.assertEqual(question.downvotes, 1)

    def test_questions_sort_by_score_then_recency(self) -> None:
        self.ask_question("First question?", "first@example.com")
        first = app_module.get_ama_questions()[0]
        self.ask_question("Second question?", "second@example.com")
        second = [item for item in app_module.get_ama_questions() if item.id != first.id][0]

        self.vote_question(first.id, "voter1@example.com", 1)
        self.vote_question(first.id, "voter2@example.com", 1)

        response = self.client.get("/ama")
        body = response.get_data(as_text=True)
        self.assertLess(body.index("First question?"), body.index("Second question?"))
        self.assertEqual(app_module.get_ama_questions()[0].id, first.id)
        self.assertEqual(second.question, "Second question?")


if __name__ == "__main__":
    unittest.main()
