# Publica la release de KMAlumnos en GitHub con los assets bien nombrados
# y verifica que el auto-update funcionará. Uso:
#   python publicar_release.py --notas "Texto de la release" [--dry-run]
import argparse
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]  # .claude/skills/publicar-release/scripts -> raíz del repo
REPO = 'danixp3/kmalumnos'
API = f'https://api.github.com/repos/{REPO}'


def gh_headers():
    auth = json.loads((ROOT / '.mcp.json').read_text(encoding='utf-8'))['mcpServers']['github']['headers']['Authorization']
    return {'Authorization': auth, 'Accept': 'application/vnd.github+json'}


def req(url, data=None, headers=None, method='GET'):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(r) as resp:
        body = resp.read()
        return resp.status, json.loads(body) if body.strip().startswith(b'{') or body.strip().startswith(b'[') else body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--notas', default='', help='Descripción para la página de la release')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    tag = f'v{version}'
    print(f'version en package.json: {version}')

    # 1. Artefactos en dist/ (electron-builder los genera con espacios; se suben con guiones)
    exe = ROOT / 'dist' / f'KMAlumnos Setup {version}.exe'
    blockmap = ROOT / 'dist' / f'KMAlumnos Setup {version}.exe.blockmap'
    yml = ROOT / 'dist' / 'latest.yml'
    for f in (exe, blockmap, yml):
        if not f.exists():
            sys.exit(f'ERROR: falta {f} — ¿se ejecutó "npm run dist" con la versión ya subida?')
    yml_text = yml.read_text(encoding='utf-8')
    if f'version: {version}' not in yml_text:
        sys.exit(f'ERROR: dist/latest.yml no es de la versión {version} — regenerar con "npm run dist"')
    if f'KMAlumnos-Setup-{version}.exe' not in yml_text:
        sys.exit('ERROR: latest.yml no apunta al nombre con guiones — revisar configuración de electron-builder')
    print('artefactos de dist/ correctos')

    H = gh_headers()

    # 2. La release no debe existir ya
    try:
        req(f'{API}/releases/tags/{tag}', headers=H)
        sys.exit(f'ERROR: la release {tag} ya existe en GitHub — sube la versión en package.json o borra esa release')
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise

    uploads = [
        (exe, f'KMAlumnos-Setup-{version}.exe', 'application/octet-stream'),
        (blockmap, f'KMAlumnos-Setup-{version}.exe.blockmap', 'application/octet-stream'),
        (yml, 'latest.yml', 'text/yaml'),
    ]
    if args.dry_run:
        print(f'[dry-run] crearía la release {tag} y subiría:')
        for local, name, _ in uploads:
            print(f'  {name}  ({local.stat().st_size} bytes)')
        return

    # 3. Crear release y subir assets
    body = json.dumps({'tag_name': tag, 'target_commitish': 'main',
                       'name': f'KMAlumnos {tag}', 'body': args.notas}).encode()
    _, rel = req(f'{API}/releases', data=body, headers={**H, 'Content-Type': 'application/json'}, method='POST')
    print('release creada:', rel['id'])

    for local, name, ctype in uploads:
        url = f'https://uploads.github.com/repos/{REPO}/releases/{rel["id"]}/assets?name={name}'
        _, a = req(url, data=local.read_bytes(), headers={**H, 'Content-Type': ctype}, method='POST')
        print('subido:', a['name'], a['size'])

    # 4. Verificación de auto-update: latest.yml público resuelve a esta versión y el exe descarga
    _, pub_yml = req(f'https://github.com/{REPO}/releases/latest/download/latest.yml')
    if f'version: {version}' not in pub_yml.decode('utf-8'):
        sys.exit('ERROR: el latest.yml publicado NO es de esta versión — revisar la release en GitHub')
    r = urllib.request.Request(
        f'https://github.com/{REPO}/releases/download/{tag}/KMAlumnos-Setup-{version}.exe', method='HEAD')
    with urllib.request.urlopen(r) as resp:  # HEAD: comprueba sin descargar 81 MB
        if resp.status != 200:
            sys.exit(f'ERROR: el instalador devuelve HTTP {resp.status}')
    print(f'RELEASE-OK {tag}: auto-update verificado (latest.yml correcto, instalador HTTP 200)')


if __name__ == '__main__':
    main()
