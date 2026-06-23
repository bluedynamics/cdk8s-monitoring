# Configuration file for the Sphinx documentation builder.
#
# This file only contains a selection of the most common options. For a full
# list see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------

project = "cdk8s-monitoring"
copyright = "2026, Blue Dynamics Alliance"
author = "Blue Dynamics Alliance Contributors"

# The full version, including alpha/beta/rc tags.
# Read version from git tags.
import subprocess

try:
    # Get the latest git tag
    result = subprocess.run(
        ["git", "describe", "--tags", "--abbrev=0"],
        capture_output=True,
        text=True,
        check=True,
    )
    release = result.stdout.strip().lstrip("v")  # Remove 'v' prefix if present
except (subprocess.CalledProcessError, FileNotFoundError):
    # Fallback to 0.0.0 if git is not available or no tags exist
    release = "0.0.0"


# -- General configuration ---------------------------------------------------

# Add any Sphinx extension module names here, as strings. They can be
# extensions coming with Sphinx (named 'sphinx.ext.*') or your custom
# ones.
extensions = [
    "myst_parser",
    "sphinxcontrib.mermaid",
    "sphinx_design",  # For grid and card directives
    "sphinx_copybutton",  # Add copy button to code blocks
]

# MyST specific extensions
myst_enable_extensions = [
    "deflist",  # Definition lists
    "colon_fence",  # Allow ::: fences for directives (needed for grid, cards, etc.)
]

# Treat code fences with these languages as Sphinx directives
myst_fence_as_directive = ["mermaid"]

# Add any paths that contain templates here, relative to this directory.
templates_path = ["_templates"]

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
# This pattern also affects html_static_path and html_extra_path.
exclude_patterns = []

# mermaid options
mermaid_output_format = "raw"  # Use client-side rendering with mermaid.js

# -- Options for HTML output -------------------------------------------------

# Base URL for GitHub Pages deployment.
html_baseurl = "https://bluedynamics.github.io/cdk8s-monitoring"

# The theme to use for HTML and HTML Help pages.
html_theme = "shibuya"

html_theme_options = {
    # Logo configuration - absolute path resolves relative to html_baseurl
    "logo_target": "/",
    # Color scheme - using cyan from brand palette (#00d4ff)
    "accent_color": "cyan",
    # Color mode - force dark mode (brand is dark-first cyberpunk aesthetic)
    "color_mode": "dark",
    # Dark code blocks
    "dark_code": True,
    # Navigation
    "nav_links": [],
}

# Logo configuration (Shibuya uses a different approach)
html_logo = "_static/kup6s-icon-monitoring.svg"

# Add any paths that contain custom static files (such as style sheets) here,
# relative to this directory.
html_static_path = ["_static"]

# Custom CSS files
html_css_files = [
    "brand-theme.css",  # Main brand theme (fonts, colors, design, icons)
    "custom-icons.css",  # Custom icon styling for section headers
]

# Custom JavaScript files
html_js_files = [
    "logo-fix.js",  # Fix logo link for path prefix deployment
]
