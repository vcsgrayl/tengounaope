import re
import csv
import json
from pathlib import Path


def limpiar_texto(texto):
    # Elimina cabeceras frecuentes sin tocar el cuerpo de preguntas
    texto = re.sub(r"--- PAGE \d+ ---", "", texto)
    texto = re.sub(r"(?im)^PREGUNTAS BATERÍA COMÚN.*$", "", texto)
    texto = re.sub(r"(?im)^Categorías .*?$", "", texto)
    return texto


def normalizar_espacios(texto):
    return re.sub(r"\s+", " ", texto).strip()


def extraer_opciones(bloque):
    # Las opciones del PDF aparecen con etiquetas a) b) c) d)
    inicio_opciones = re.search(r"(?im)(?:^|\n)\s*a\)\s*", bloque)
    if not inicio_opciones:
        return normalizar_espacios(bloque), []

    enunciado = normalizar_espacios(bloque[: inicio_opciones.start()])
    texto_opciones = bloque[inicio_opciones.start() :]

    marcadores = list(re.finditer(r"(?im)(?:^|\n)\s*([a-d])\)\s*", texto_opciones))
    opciones_por_letra = {}

    for i, match in enumerate(marcadores):
        letra = match.group(1).lower()
        ini = match.end()
        fin = marcadores[i + 1].start() if i + 1 < len(marcadores) else len(texto_opciones)
        opciones_por_letra[letra] = normalizar_espacios(texto_opciones[ini:fin])

    opciones = [opciones_por_letra.get(letra, "") for letra in ("a", "b", "c", "d")]
    return enunciado, opciones


def parsear_preguntas(texto_sucio):
    texto = limpiar_texto(texto_sucio)
    patron_pregunta = re.compile(r"(?m)^\s*(\d{1,3})\.\-\s*")
    resultados = []
    matches = list(patron_pregunta.finditer(texto))

    for i, match in enumerate(matches):
        num = int(match.group(1))
        inicio = match.end()
        fin = matches[i + 1].start() if i + 1 < len(matches) else len(texto)
        bloque = texto[inicio:fin].strip()
        enunciado, opciones = extraer_opciones(bloque)

        resultados.append({
            "num_pregunta": num,
            "enunciado": enunciado,
            "opciones": json.dumps(opciones, ensure_ascii=False)
        })

    return resultados


def parsear_respuestas(texto_respuestas):
    # Formato esperado por línea: "1 A" o "1\tA"
    letra_a_indice = {"A": 0, "B": 1, "C": 2, "D": 3}
    patron = re.compile(r"^\s*(\d{1,3})\s+([A-Da-d])\s*$")
    respuestas = {}

    for linea in texto_respuestas.splitlines():
        m = patron.match(linea)
        if not m:
            continue
        num = int(m.group(1))
        letra = m.group(2).upper()
        respuestas[num] = letra_a_indice[letra]

    return respuestas


def añadir_respuesta_correcta(preguntas, respuestas):
    for p in preguntas:
        num = int(p["num_pregunta"])
        p["respuesta_correcta"] = respuestas.get(num)
    return preguntas


def guardar_csv(preguntas, salida_csv):
    with open(salida_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=["num_pregunta", "enunciado", "opciones", "respuesta_correcta"]
        )
        writer.writeheader()
        writer.writerows(preguntas)


def main():
    base_dir = Path(__file__).resolve().parent
    input_txt = base_dir / "datos.txt"
    respuestas_txt = base_dir / "respuestas.txt"
    output_csv = base_dir / "preguntas.csv"

    if not input_txt.exists():
        raise FileNotFoundError(f"No se encontró el archivo: {input_txt}")
    if not respuestas_txt.exists():
        raise FileNotFoundError(f"No se encontró el archivo: {respuestas_txt}")

    texto = input_txt.read_text(encoding="utf-8")
    texto_respuestas = respuestas_txt.read_text(encoding="utf-8")
    preguntas = parsear_preguntas(texto)
    respuestas = parsear_respuestas(texto_respuestas)
    preguntas = añadir_respuesta_correcta(preguntas, respuestas)
    guardar_csv(preguntas, output_csv)

    print(f"Preguntas parseadas: {len(preguntas)}")
    print(f"CSV generado en: {output_csv}")
    if preguntas:
        nums = [int(p["num_pregunta"]) for p in preguntas]
        faltantes = sorted(set(range(min(nums), max(nums) + 1)) - set(nums))
        print(f"Rango detectado: {min(nums)}-{max(nums)}")
        print(f"Preguntas faltantes en el TXT: {faltantes[:20]}{'...' if len(faltantes) > 20 else ''}")
    if preguntas:
        print(f"Ejemplo opciones JSON: {preguntas[0]['opciones']}")
        print(f"Ejemplo respuesta_correcta: {preguntas[0]['respuesta_correcta']}")


if __name__ == "__main__":
    main()