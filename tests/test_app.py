from __future__ import annotations

import os
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

os.environ["NEJACHEQUE_REMINDERS"] = "0"

from fastapi.testclient import TestClient

from nejacheque import service as cs
from nejacheque.app import app
from nejacheque.config import settings
from nejacheque.db import init_db


def cheque(days: int = 2, **extra) -> dict:
    return {"bank": "بانک ملت", "due_date": "1405/08/19", "due_on": (date.today() + timedelta(days=days)).isoformat(),
            "amount": "125000000", "payee": "فروشگاه نمونه", **extra}


class AppTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        old = settings.data_dir
        settings.data_dir = Path(tmp.name)
        init_db()

        def cleanup():
            settings.data_dir = old
            tmp.cleanup()
        self.addCleanup(cleanup)
        self.client = TestClient(app)

    def setup_admin(self) -> TestClient:
        r = self.client.post("/api/auth/setup", json={"username": "admin", "password": "secret-pass", "name": "مدیر"})
        self.assertEqual(r.status_code, 200, r.text)
        return self.client

    def test_first_run_login_and_pages(self):
        self.assertTrue(self.client.get("/api/auth/state").json()["setup_needed"])
        self.assertEqual(self.client.get("/api/cheque/bootstrap").status_code, 401)
        self.assertEqual(self.client.post("/api/auth/setup", json={"username": "a", "password": "short"}).status_code, 422)
        admin = self.setup_admin()
        self.assertEqual(admin.post("/api/auth/setup", json={"username": "x", "password": "secret-pass"}).status_code, 409)
        self.assertEqual(admin.get("/api/cheque/bootstrap").json()["me"]["role"], "manager")
        self.assertIn("نژا چک", self.client.get("/").text)
        self.assertIn("login", self.client.get("/login").text)
        admin.post("/api/auth/logout")
        self.assertEqual(admin.get("/api/auth/me").status_code, 401)
        other = TestClient(app)
        self.assertEqual(other.post("/api/auth/login", json={"username": "admin", "password": "wrong-pass"}).status_code, 401)
        self.assertEqual(other.post("/api/auth/login", json={"username": "ADMIN", "password": "secret-pass"}).status_code, 200)

    def test_users_roles_and_last_manager(self):
        admin = self.setup_admin()
        u = admin.post("/api/users", json={"username": "op1", "password": "operator-1", "name": "کاربر", "role": "operator"}).json()
        self.assertEqual(admin.post("/api/users", json={"username": "op1", "password": "operator-1"}).status_code, 422)
        op = TestClient(app)
        self.assertEqual(op.post("/api/auth/login", json={"username": "op1", "password": "operator-1"}).status_code, 200)
        self.assertEqual(op.get("/api/cheque/bootstrap").json()["me"]["role"], "operator")
        self.assertEqual(op.get("/api/users").status_code, 403)
        self.assertEqual(op.get("/api/cheque/backup").status_code, 403)
        admin_id = admin.get("/api/auth/me").json()["user"]["id"]
        self.assertEqual(admin.patch(f"/api/users/{admin_id}", json={"role": "operator"}).status_code, 422)
        self.assertEqual(admin.patch(f"/api/users/{u['id']}", json={"active": False}).status_code, 200)
        self.assertEqual(op.get("/api/cheque/bootstrap").status_code, 401)      # sessions dropped

    def test_register_received_backup(self):
        admin = self.setup_admin()
        admin.put("/api/cheque/docs/template/t1", json={"id": "t1", "name": "قالب"})
        admin.put("/api/cheque/docs/book/b1", json={"id": "b1", "title": "جاری"})
        rows = admin.post("/api/cheque/issued", json={"items": [cheque(book_id="b1", serial="000101")]}).json()["items"]
        self.assertEqual((rows[0]["status"], rows[0]["serial"]), ("issued", "000101"))
        self.assertEqual(admin.patch(f"/api/cheque/issued/{rows[0]['id']}", json={"status": "cleared"}).json()["status"], "cleared")
        rv = admin.post("/api/cheque/received", json={**cheque(1), "drawer": "مشتری", "amount": "۵۰۰۰۰۰۰"}).json()
        self.assertEqual(rv["amount"], "5000000")
        boot = admin.get("/api/cheque/bootstrap").json()
        self.assertEqual((len(boot["templates"]), len(boot["books"]), len(boot["issued"]), len(boot["received"])), (1, 1, 1, 1))
        backup = admin.get("/api/cheque/backup").json()
        self.assertEqual(admin.post("/api/cheque/restore", json=backup).json(), {"docs": 2, "issued": 1, "received": 1})

    def test_reminders(self):
        admin = self.setup_admin()
        admin.post("/api/cheque/issued", json={"items": [cheque(-1, payee="دیرکرد"), cheque(1)]})
        admin.put("/api/cheque/reminders", json={"enabled": True, "token": "tok", "chat_ids": ["123456"], "hour": 0,
                                                 "sms_enabled": True, "sms_key": "k", "sms_numbers": ["09121234567"], "sms_provider": "smsir"})
        cfg = admin.get("/api/cheque/reminders").json()
        self.assertTrue(cfg["has_token"] and cfg["has_sms_key"])
        self.assertNotIn("token", cfg)
        self.assertEqual(admin.get("/api/cheque/access").json(), {"role": "manager", "due": 2})
        bale, sms = [], []
        with patch.object(cs, "_bale", side_effect=lambda t, m, d=None: bale.append(d)), patch.object(cs, "send_sms", side_effect=lambda *a: sms.append(a)):
            self.assertEqual(cs.send_reminders(now=datetime.now().replace(hour=10)), 2)
            self.assertEqual(cs.send_reminders(now=datetime.now().replace(hour=11)), 0)
        self.assertIn("دیرکرد", bale[0]["text"])
        self.assertEqual(sms[0][0], "smsir")


if __name__ == "__main__":
    unittest.main()
