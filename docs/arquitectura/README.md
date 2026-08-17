# Documentación de arquitectura

Fuente LaTeX del documento `arquitectura.pdf`: cómo funciona la plataforma, pieza por
pieza, con cinco diagramas.

## Compilar

**Requiere `xelatex`**, no `pdflatex`: el preámbulo usa `fontspec` para cargar las fuentes.

```bash
cd docs/arquitectura
xelatex -interaction=nonstopmode arquitectura.tex   # dos veces: la segunda arma el índice
xelatex -interaction=nonstopmode arquitectura.tex
```

En Arch, lo que hace falta:

```bash
sudo pacman -S texlive-basic texlive-latexrecommended texlive-latexextra \
               texlive-langspanish texlive-binextra texlive-fontsrecommended \
               texlive-xetex ttf-jetbrains-mono
```

Tipografía: TeX Gyre Pagella (cuerpo y matemática) y TeX Gyre Heros (diagramas), ambas de
`texlive-fontsrecommended`; JetBrains Mono para código, del sistema. Las TeX Gyre viven en
texmf y **no** están registradas en fontconfig, así que se cargan por nombre de archivo
(`texgyrepagella` + `Extension=.otf`), no por nombre de familia — cargarlas por familia
falla con "font cannot be found".

## Estructura

```
arquitectura.tex     ← maestro: portada, índice, orden de las secciones
preambulo.tex        ← paquetes, paleta, estilos de TikZ, macros
secciones/           ← una sección por archivo
figuras/             ← una figura TikZ por archivo
```

## Convenciones al editar

- Cada sección y cada figura vive en su propio archivo. Agregar una sección es crear el
  archivo e incluirlo en el maestro.
- Los colores y los estilos de nodo se definen **solo** en `preambulo.tex`. Nada de
  `draw=blue!50` suelto dentro de una figura.
- `\nota{...}` **no admite `\\` adentro**: el salto de línea de un nodo de TikZ es una
  celda de alineación y no cruza el grupo. Una `\nota` por línea.
- Los datos numéricos (filas cargadas, PR, cantidad de pruebas) salen del sistema de
  memoria en `docs/memoria/`. Si cambian ahí, actualizar la sección de estado.
