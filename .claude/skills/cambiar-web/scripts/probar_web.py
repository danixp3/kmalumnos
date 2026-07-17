# Smoke test de la web movil publicada (https://kmalumnos-remote.vercel.app)
# Uso: python probar_web.py [--pin 1234] [--url https://...]
# Solo operaciones de lectura (login + GETs): no crea ni modifica datos.
# Termina imprimiendo WEB-OK o WEB-FAIL con el detalle del primer fallo.
import argparse
import json
import os
import sys
import urllib.request
import urllib.error

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
    p.add_argument("--pin", default=os.environ.get("API_PIN", "2004"),
                   help="PIN de la web (por defecto el documentado en CONTEXT.md)")
    p.add_argument("--url", default="https://kmalumnos-remote.vercel.app")
    args = p.parse_args()
    base = args.url.rstrip("/")

    # 1. La pagina carga
    status, cuerpo = peticion(base + "/")
    if status != 200:
        fallo(f"la portada no responde 200 (status={status}: {cuerpo})")
    print(f"portada: 200 OK")

    # 2. Login con PIN
    status, cuerpo = peticion(base + "/api/auth", "POST", {"pin": args.pin})
    if status != 200 or not isinstance(cuerpo, dict) or not cuerpo.get("token"):
        fallo(f"login fallido (status={status}: {cuerpo})")
    token = cuerpo["token"]
    print("login: OK (token recibido)")

    # 3. Un token invalido debe rechazarse (la puerta no esta abierta de par en par)
    status, _ = peticion(base + "/api/alumnos", cabeceras={"X-API-Token": "no-valido"})
    if status != 401:
        fallo(f"un token invalido devolvio {status} en /api/alumnos (se esperaba 401)")
    print("token invalido rechazado: OK (401)")

    # 4. Endpoints de lectura con el token bueno
    auth = {"X-API-Token": token}
    for endpoint in ["vehiculos", "alumnos", "historial"]:
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
