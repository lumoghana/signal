"""Private matcher called by the signed Lumo recovery service, never a browser."""
from http.server import BaseHTTPRequestHandler
from face_service.http import MAX_REQUEST_BYTES, handle_request


class handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if length < 2 or length > MAX_REQUEST_BYTES:
            self.send_response(413)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":false,"code":"INVALID_INPUT"}')
            return
        status, body, headers = handle_request(self.rfile.read(length), self.headers)
        self.send_response(status)
        for name, value in headers.items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.send_response(405)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    do_OPTIONS = do_GET
