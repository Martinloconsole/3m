"""Personaliza el proyecto Android que genera `npx cap add android`.

- Copia iconos (launcher, adaptable, notificación) y color de fondo.
- Reemplaza la pantalla de arranque (splash) por fondo violeta oscuro con el logo.
- Asegura el permiso POST_NOTIFICATIONS (Android 13+).

Uso: python native/patch_android.py [carpeta_android]
"""
import os
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ANDROID = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "android"
RES = ANDROID / "app" / "src" / "main" / "res"
MANIFEST = ANDROID / "app" / "src" / "main" / "AndroidManifest.xml"
BG = (18, 10, 31, 255)  # #120A1F

if not RES.is_dir():
    sys.exit(f"No existe {RES}. Ejecuta antes: npx cap add android")

# 1) Iconos y colores
shutil.copytree(ROOT / "native" / "res", RES, dirs_exist_ok=True)
print("Iconos copiados")

# 2) Splash: mismo tamaño que cada splash.png existente, fondo oscuro y logo centrado
logo = Image.open(ROOT / "www" / "icons" / "icon-512.png").convert("RGBA")
count = 0
for p in RES.rglob("splash*.png"):
    w, h = Image.open(p).size
    canvas = Image.new("RGBA", (w, h), BG)
    side = int(min(w, h) * 0.30)
    l = logo.resize((side, side), Image.LANCZOS)
    canvas.alpha_composite(l, ((w - side) // 2, (h - side) // 2))
    canvas.convert("RGB").save(p)
    count += 1
print(f"Splash reemplazados: {count}")

# 3) Permiso de notificaciones
text = MANIFEST.read_text(encoding="utf-8")
perm = '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
if "POST_NOTIFICATIONS" not in text:
    text = text.replace("</manifest>", f"    {perm}\n</manifest>")
    MANIFEST.write_text(text, encoding="utf-8")
    print("Permiso POST_NOTIFICATIONS agregado")
