#!/usr/bin/env python3
"""Detecta claves de traduccion usadas en templates/JS que faltan en los JSON."""
import json, os, re, sys

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # docksemesa/
TPL = os.path.join(BASE, "templates")
JS = os.path.join(BASE, "static", "js")
TR = os.path.join(BASE, "static", "translations")

usadas = set()

# 1) Templates: data-original-text / data-original-placeholder
re_attr = re.compile(r'data-original-(?:text|placeholder)="([^"]+)"')
for fn in os.listdir(TPL):
    if fn.endswith(".html"):
        txt = open(os.path.join(TPL, fn), encoding="utf-8").read()
        usadas.update(re_attr.findall(txt))

# 2) JS: t('...') y t("...") (incluye template literals ${t('...')})
#    \bt\s*\( : "t" como palabra independiente (evita createElement/closest/split/Event...)
re_js = re.compile(r"\bt\s*\(\s*(['\"])(.*?)\1\s*\)")
for fn in os.listdir(JS):
    if fn.endswith(".js"):
        txt = open(os.path.join(JS, fn), encoding="utf-8").read()
        for m in re_js.finditer(txt):
            usadas.add(m.group(2))

# 3) modulos.js: titulo / descripcion / etiqueta (se usan con t())
re_prop = re.compile(r"^\s*(titulo|descripcion|etiqueta)\s*:\s*'([^']*)'", re.M)
mtxt = open(os.path.join(JS, "modulos.js"), encoding="utf-8").read()
usadas.update(re_prop.findall(mtxt)[i][1] for i in range(len(re_prop.findall(mtxt))))

# 4) configuracion.js SECCIONES titulos
re_sec = re.compile(r"titulo:\s*'([^']*)'")
ctxt = open(os.path.join(JS, "configuracion.js"), encoding="utf-8").read()
usadas.update(re_sec.findall(ctxt))

# 5) breadcrumb.js labels (se traducen via data-original-text)
re_label = re.compile(r"label:\s*'([^']*)'")
btxt = open(os.path.join(JS, "breadcrumb.js"), encoding="utf-8").read()
usadas.update(re_label.findall(btxt))

# ordenar
usadas = sorted(u for u in usadas if u.strip())

es = json.load(open(os.path.join(TR, "es.json"), encoding="utf-8"))
en = json.load(open(os.path.join(TR, "en.json"), encoding="utf-8"))
cs = json.load(open(os.path.join(TR, "cs.json"), encoding="utf-8"))

print("=== CLAVES USADAS PERO FALTAN EN es.json ===")
falta_es = [k for k in usadas if k not in es]
for k in falta_es:
    print(f"  - {k!r}")

print(f"\nTotal claves usadas: {len(usadas)} | en es.json: {len(es)} | faltan: {len(falta_es)}")
print("\n=== claves en es.json NO usadas (posible limpieza, informativo) ===")
sobran = [k for k in es if k not in usadas]
for k in sobran:
    print(f"  - {k!r}")
print(f"\nTotal sobran: {len(sobran)}")
