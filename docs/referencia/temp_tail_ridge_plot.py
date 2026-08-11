#!/usr/bin/env python3
"""
Temperature ridge plot with tail-probability gradient and a TOP color scale.
"""

import argparse
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.colors import Normalize
from matplotlib.cm import ScalarMappable, get_cmap
from matplotlib.collections import PolyCollection
from scipy.stats import gaussian_kde
from mpl_toolkits.axes_grid1.inset_locator import inset_axes


def parse_args():
    p = argparse.ArgumentParser(description="Ridge plot with tail-probability gradient (colorbar on top)")
    p.add_argument('--csv', required=True, help='Input CSV file path')
    p.add_argument('--ref', choices=['mean','median','quantile','value'], default='mean', help='Red line statistic (default: mean)')
    p.add_argument('--q', type=float, default=0.90, help='Quantile if --ref quantile (default: 0.90)')
    p.add_argument('--ref_value', type=float, default=None, help='Explicit reference if --ref value')
    p.add_argument('--cmap', default='viridis', help='Colormap for tail probability S(x)')
    p.add_argument('--tail_cap', type=float, default=0.4, help='Upper cap for colorbar (default: 0.4)')
    p.add_argument('--ylim_pad', type=float, default=0.8, help='Vertical spacing between ridges (default: 0.8)')
    p.add_argument('--band_scale', type=float, default=0.85, help='Relative ridge height (0..1, default: 0.85)')
    p.add_argument('--bins', type=int, default=400, help='Grid points for KDE evaluation (default: 400)')
    p.add_argument('--fig', default='temp_ridge_tail_gradient_top.png', help='Output figure filename')
    p.add_argument('--dpi', type=int, default=300, help='Figure DPI (default: 300)')
    p.add_argument('--order_by', choices=['name','mean','tail_at_ref'], default='name', help='Order ridges by name, per-sensor mean, or tail prob at reference')
    p.add_argument('--title', default='Temperature Ridge Plot with Tail-Probability Gradient', help='Figure title')
    return p.parse_args()


def clean_series(s: pd.Series) -> pd.Series:
    s = pd.to_numeric(s, errors='coerce')
    return s.replace([np.inf, -np.inf], np.nan).dropna()


def extract_temp_cols(df: pd.DataFrame):
    cols = [c for c in df.columns if c.startswith('SM_')]
    if not cols:
        raise ValueError("No temperature columns found (expected names starting with 'Temp_')")
    return cols


def ref_value(df: pd.DataFrame, cols, ref='mean', q=0.9, value=None) -> float:
    vals = pd.concat([clean_series(df[c]) for c in cols], axis=0)
    if ref == 'median':
        return float(vals.median())
    if ref == 'quantile':
        return float(vals.quantile(q))
    if ref == 'value' and value is not None:
        return float(value)
    return float(vals.mean())


def kde_density_and_tail(s: pd.Series, xs: np.ndarray):
    s = clean_series(s)
    if len(s) < 3:
        return np.zeros_like(xs), np.zeros_like(xs)
    kde = gaussian_kde(s)
    dens = kde(xs)
    dx = np.gradient(xs)
    cdf = np.cumsum(dens * dx)
    cdf = cdf / cdf[-1] if cdf[-1] > 0 else np.zeros_like(xs)
    tail = 1.0 - cdf
    return dens, tail


def ridge_with_tail_gradient(ax, series: pd.Series, label: str, y: float, xs: np.ndarray,
                             band_scale: float, cmap, norm):
    dens, tail = kde_density_and_tail(series, xs)
    if not np.any(dens):
        return 0.0
    dens = dens / (dens.max() if dens.max() > 0 else 1.0)
    dens = dens * band_scale

    verts, colors = [], []
    for i in range(len(xs)-1):
        x0, x1 = xs[i], xs[i+1]
        d0, d1 = dens[i], dens[i+1]
        verts.append([(x0, y), (x1, y), (x1, y + d1), (x0, y + d0)])
        s_mid = 0.5 * (tail[i] + tail[i+1])
        colors.append(cmap(norm(s_mid)))

    pc = PolyCollection(verts, facecolors=colors, edgecolors='none', alpha=0.95)
    ax.add_collection(pc)
    ax.plot(xs, y + dens, color='black', lw=0.8, alpha=0.8)
    ax.plot([xs[0], xs[-1]], [y, y], color='black', lw=0.5, alpha=0.6)
    ax.text(xs[0], y + 0.02, label, va='bottom', ha='left', fontsize=16)


def main():
    args = parse_args()
    df = pd.read_csv(args.csv)
    cols = extract_temp_cols(df)

    # x-grid
    all_vals = pd.concat([clean_series(df[c]) for c in cols], axis=0)
    x_min, x_max = float(all_vals.min()), float(all_vals.max())
    pad = 0.02 * (x_max - x_min if x_max > x_min else 1.0)
    x_min -= pad
    x_max += pad
    xs = np.linspace(x_min, x_max, args.bins)

    # Reference
    T = ref_value(df, cols, ref=args.ref, q=args.q, value=args.ref_value)

    # Order
    if args.order_by == 'name':
        ordered = sorted(cols)
    elif args.order_by == 'mean':
        ordered = sorted(cols, key=lambda c: clean_series(df[c]).mean())
    else:
        sref = {c: float((clean_series(df[c]) >= T).mean()) for c in cols}
        ordered = sorted(cols, key=lambda c: sref[c])

    # Figure
    rows = len(ordered)
    height = max(4.5, 0.6 * rows)
    fig, ax = plt.subplots(figsize=(10, height))

    # Colormap and TOP colorbar
    cmap = get_cmap(args.cmap)
    norm = Normalize(vmin=0.0, vmax=args.tail_cap)

    y = 0.0
    for col in reversed(ordered):
        ridge_with_tail_gradient(ax, df[col], col, y, xs, args.band_scale, cmap, norm)
        y += args.ylim_pad

    ax.axvline(T, color='red', ls='--', lw=2)

    ax.set_yticks([])
    ax.set_xlabel('Soil Mositure(%)', fontsize=14)
    #ax.set_title(args.title)
    ax.set_xlim(xs[0], xs[-1])
    ax.set_ylim(-0.2, y - 1.0 + 1.0)
    ax.tick_params(axis='x', labelsize=14)

    # Place colorbar at the TOP using an inset axes in axes coordinates
    cax = ax.inset_axes([0.1, 1.04, 0.8, 0.04])  # [x0,y0,width,height] in Axes coords
    sm = ScalarMappable(norm=norm, cmap=cmap)
    sm.set_array([])
    cbar = fig.colorbar(sm, cax=cax, orientation='horizontal')
    cbar.set_label('Tail probability')
    cbar.ax.xaxis.set_ticks_position('top')
    cbar.ax.xaxis.set_label_position('top')

    # Leave extra space on top for the colorbar
    fig.tight_layout(rect=[0, 0, 1, 0.92])
    fig.savefig(args.fig, dpi=args.dpi, bbox_inches='tight')
    print(f"Saved figure to {args.fig}")
    print(f"Reference ({args.ref}) = {T:.3f}")


if __name__ == '__main__':
    main()
