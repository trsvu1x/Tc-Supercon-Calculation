from http.server import HTTPServer, BaseHTTPRequestHandler
import json, math, sqlite3, urllib.parse

DB = "results.db"

def init_db():
    con = sqlite3.connect(DB)
    con.execute("""
        CREATE TABLE IF NOT EXISTS calculations (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            omega_log REAL,
            lambda    REAL,
            mu_star   REAL,
            tc        REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    con.commit()
    con.close()

def mcmillan(omega_log, lam, mu_star):
    denom = lam - mu_star * (1 + 0.62 * lam)
    if denom <= 0:
        return None
    return (omega_log / 1.2) * math.exp(-1.04 * (1 + lam) / denom)

def save(omega_log, lam, mu_star, tc):
    con = sqlite3.connect(DB)
    con.execute("INSERT INTO calculations (omega_log, lambda, mu_star, tc) VALUES (?,?,?,?)",
                (omega_log, lam, mu_star, tc))
    con.commit()
    con.close()

def get_history():
    con = sqlite3.connect(DB)
    rows = con.execute("SELECT id, omega_log, lambda, mu_star, tc, created_at FROM calculations ORDER BY id DESC LIMIT 50").fetchall()
    con.close()
    return [{"id": r[0], "omega_log": r[1], "lambda": r[2], "mu_star": r[3], "tc": r[4], "created_at": r[5]} for r in rows]

def delete_row(row_id):
    con = sqlite3.connect(DB)
    con.execute("DELETE FROM calculations WHERE id = ?", (row_id,))
    con.commit()
    con.close()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # silence logs

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/history":
            self.send_json(get_history())
        else:
            self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path == "/calculate":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            omega_log = float(body["omega_log"])
            lam       = float(body["lambda"])
            mu_star   = float(body.get("mu_star", 0.10))
            tc = mcmillan(omega_log, lam, mu_star)
            if tc is not None:
                save(omega_log, lam, mu_star, round(tc, 4))
            self.send_json({"tc": round(tc, 4) if tc else None})

    def do_DELETE(self):
        if self.path.startswith("/delete/"):
            row_id = int(self.path.split("/")[-1])
            delete_row(row_id)
            self.send_json({"ok": True})

init_db()
print("Server running → http://localhost:8000")
HTTPServer(("", 8000), Handler).serve_forever()
