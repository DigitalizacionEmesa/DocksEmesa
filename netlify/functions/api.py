import os
import sys

# Añadir la raíz del proyecto al path de Python
ROOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../..")
)

if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app import app

from serverless_wsgi import handle_request


def handler(event, context):
    return handle_request(app, event, context)