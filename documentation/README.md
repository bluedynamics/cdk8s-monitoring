# cdk8s-monitoring documentation

This directory contains the documentation for `@bluedynamics/cdk8s-monitoring`, built with [Sphinx](https://www.sphinx-doc.org/), [MyST Parser](https://myst-parser.readthedocs.io/), and organized with the [Diátaxis framework](https://diataxis.fr/).

## Published documentation

<https://bluedynamics.github.io/cdk8s-monitoring/>

## Build locally

### Prerequisites

- Python 3.13 (or 3.10+ with manual configuration)
- The `make` command
- `uv` (optional, but recommended for faster installs)

### Quick start

```shell
cd documentation
make docs
```

Open `html/index.html` in your browser.

The first build creates a virtual environment, installs Sphinx and the required extensions, and generates the HTML.
Subsequent builds reuse the environment and are much faster.

### Live reload

```shell
cd documentation
make docs-live
```

This starts a development server that rebuilds and refreshes the browser whenever you save a file.

### Clean build

```shell
make clean
make docs
```

## Structure

The documentation follows the four Diátaxis quadrants.

```
sources/
├── index.md            # Landing page with grid cards
├── tutorials/          # Learning-oriented lessons
├── how-to/             # Goal-oriented recipes
├── reference/          # Information-oriented specifications
│   └── api/            # Construct and interface overview
├── explanation/        # Understanding-oriented background
└── _static/            # CSS, icons, fonts, scripts
```

## Style

Documentation is authored in plone-doc-style: American English, one sentence per line, sentence-case headings, dash-separated filenames, and sparse admonitions.

## Theme and extensions

- **Theme:** [Shibuya](https://shibuya.lepture.com/)
- **Parser:** [MyST](https://myst-parser.readthedocs.io/)
- **Extensions:** `myst_parser`, `sphinxcontrib.mermaid`, `sphinx_design`, `sphinx_copybutton`

## Deployment

A push to `main` that touches `documentation/` triggers the `documentation.yml` GitHub Actions workflow, which builds the site and deploys it to GitHub Pages.
