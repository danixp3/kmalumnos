# Smoke test de la web movil publicada (https://kmalumnos-remote.vercel.app)
# Uso: python probar_web.py [--email correo@ejemplo.com] [--password ...] [--url https://...]
# Solo operaciones de lectura (login contra Supabase Auth + GETs): no crea ni modifica datos.
# Termina imprimiendo WEB-OK o WEB-FAIL con el detalle del primer fallo.
import argparse
import json
import os
import sys
import urllib.request
import urllib.error

# Misma anon key publica que usa la app de escritorio (sync.js, constante SUPABASE_ANON).
SUPABASE_URL = "https://dmwoqugdnwgkcqtixhyw.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd29xdWdkbndna2NxdGl4aHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMjA5NjYsImV4cCI6MjA5OTU5Njk2Nn0."
    "8XhWdS0ohrCbZcKpHWKsJz22rY8ASA4IkgpbtE_pHkc"
)


def peticion(url, metodo="GET", cuerpo=None, cabeceras=None):
    """Devuelve (status, dict|texto). No lanza excepciones por status HTTP."""
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo)
    req.add_header("Content-Type", "application/json")
    for k, v in (cabeceras or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            texto = r.read().decode()
            status = r.status
    except urllib.error.HTTPError as e:
        texto = e.read().decode()
        status = e.code
    except Exception as e:
        return None, str(e)
    try:
        return status, json.loads(texto)
    except ValueError:
        return status, texto


def fallo(mensaje):
    print(f"WEB-FAIL: {mensaje}")
    sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--email", default=os.environ.get("SYNC_EMAIL"),
                   help="Email de la cuenta de sincronizacion (por defecto SYNC_EMAIL del entorno)")
    p.add_argument("--password", default=os.environ.get("SYNC_PASSWORD"),
                   help="Contrasena de la cuenta de sincronizacion (por defecto SYNC_PASSWORD del entorno)")
    p.add_argument("--url", default="https://kmalumnos-remote.vercel.app")
    args = p.parse_args()
    base = args.url.rstrip("/")

    if not args.email or not args.password:
        fallo("faltan credenciales: pasa --email/--password o define SYNC_EMAIL/SYNC_PASSWORD")

    # 1. La pagina carga
    status, cuerpo = peticion(base + "/")
    if status != 200:
        fallo(f"la portada no responde 200 (status={status}: {cuerpo})")
    print(f"portada: 200 OK")

    # 2. Login contra Supabase Auth (email+password, misma cuenta que la app de escritorio)
    status, cuerpo = peticion(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        "POST",
        {"email": args.email, "password": args.password},
        cabeceras={"apikey": SUPABASE_ANON_KEY},
    )
    if status != 200 or not isinstance(cuerpo, dict) or not cuerpo.get("access_token"):
        fallo(f"login fallido contra Supabase Auth (status={status}: {cuerpo})")
    token = cuerpo["access_token"]
    print("login: OK (access_token recibido)")

    # 3. Un token invalido debe rechazarse (la puerta no esta abierta de par en par)
    status, _ = peticion(base + "/api/alumnos", cabeceras={"Authorization": "Bearer no-valido"})
    if status != 401:
        fallo(f"un token invalido devolvio {status} en /api/alumnos (se esperaba 401)")
    print("token invalido rechazado: OK (401)")

    # 4. Endpoints de lectura con el token bueno
    auth = {"Authorization": f"Bearer {token}"}
    for endpoint in ["vehiculos", "alumnos", "historial", "profesores"]:
        status, cuerpo = peticion(f"{base}/api/{endpoint}", cabeceras=auth)
        if status != 200:
            fallo(f"/api/{endpoint} devolvio status={status}: {cuerpo}")
        # Los endpoints devuelven la lista directamente o bajo una clave del objeto
        if isinstance(cuerpo, list):
            lista = cuerpo
        elif isinstance(cuerpo, dict):
            lista = next((v for v in cuerpo.values() if isinstance(v, list)), None)
        else:
            lista = None
        if lista is None:
            fallo(f"/api/{endpoint} no devolvio ninguna lista: {cuerpo}")
        print(f"/api/{endpoint}: {len(lista)} registros")

    print("WEB-OK")


if __name__ == "__main__":
    main()
