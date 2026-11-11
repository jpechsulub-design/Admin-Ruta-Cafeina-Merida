# Ruta Cafeína Mérida · sitio privado

Panel interno de Ruta Cafeína Mérida con la sección **Competencia** (lista, fichas y diapositivas).

El contenido va **cifrado** dentro de `index.html` (AES-256-GCM, clave derivada de la contraseña con PBKDF2-SHA256, 600,000 vueltas).
Quien abre la página sin la contraseña solo ve la pantalla de acceso. La contraseña no está en este repositorio.

## Cómo actualizar el contenido
1. Edita `fuente/datos.json` (competidores y diapositivas) o `plantilla/app.html` (portada y secciones). La carpeta `fuente/` no se sube a GitHub.
2. Ejecuta: `RC_CLAVE="tu contraseña" node construir.mjs`
3. Sube el `index.html` nuevo.

Para cambiar la contraseña, vuelve a ejecutar el paso 2 con la contraseña nueva.

## Publicación
GitHub Pages: rama `main`, carpeta `/ (root)`. Aunque el repositorio sea privado, el sitio publicado con Pages es accesible por Internet; por eso el contenido está cifrado.
