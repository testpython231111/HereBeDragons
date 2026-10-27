#!/usr/bin/env python3
"""Build Off the Map game data.

Sources (all open data, no hand-made answer lists):
  - Natural Earth 1:50m / 1:10m admin-0 countries, tiny countries, populated places,
    coastline and lakes (public domain)
  - world-countries (mledoze, ODbL): names, borders, languages, landlocked, capitals
  - flag colour coverage measured from flag-icons SVGs (MIT) by flag_colors.js

Usage: python3 -I build_data.py <raw dir> <data dir>
Writes: countries.json, cities.json, geo50.geojson, lakes.geojson
"""
import json
import math
import sys
import unicodedata

import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import unary_union

RAW, OUT = sys.argv[1], sys.argv[2]


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


ne50 = load(f'{RAW}/ne/ne_50m_admin_0_countries.geojson')['features']
ne10 = load(f'{RAW}/ne/ne_10m_admin_0_countries.geojson')['features']
tiny = load(f'{RAW}/ne/ne_50m_admin_0_tiny_countries.geojson')['features']
places = load(f'{RAW}/ne/ne_10m_populated_places.geojson')['features']
coast = load(f'{RAW}/ne/ne_10m_coastline.geojson')['features']
lakes = load(f'{RAW}/ne/ne_10m_lakes.geojson')['features']
WC = {c['cca3']: c for c in load(f'{RAW}/npm/node_modules/world-countries/countries.json')}
FLAGS = load(f'{OUT}/flag_cov.json')

# ---------------------------------------------------------------- identities
# Natural Earth codes that differ from ISO / world-countries. Somaliland and Northern
# Cyprus are folded into the internationally recognised state; small 10m-only patches
# are folded into the state that administers them or ignored.
REMAP = {
    'KOS': 'UNK', 'PSX': 'PSE', 'SAH': 'ESH', 'SDS': 'SSD', 'ALD': 'ALA',
    'SOL': 'SOM', 'CYN': 'CYP', 'KAB': 'KAZ', 'USG': 'CUB', 'CNM': 'CYP',
    'ESB': 'GBR', 'WSB': 'GBR',
}
IGNORE = {'ATA', 'BJN', 'BRI', 'BRT', 'CLP', 'CSI', 'PGA', 'SCR', 'SER', 'SPI'}
SOVEREIGN = {k for k, c in WC.items() if c.get('unMember')} | {'PSE', 'UNK', 'TWN'}


def oid(a3):
    return REMAP.get(a3, a3)


# Common English names players might reasonably use (for name-based prompts).
ALIASES = {
    'USA': ['America', 'USA', 'United States of America'], 'GBR': ['Britain', 'Great Britain', 'UK'],
    'CZE': ['Czech Republic'], 'TUR': ['Turkey'], 'CIV': ["Côte d'Ivoire"],
    'COD': ['Democratic Republic of the Congo', 'DRC', 'Congo'], 'COG': ['Congo', 'Congo-Brazzaville'],
    'SWZ': ['Swaziland'], 'MMR': ['Burma'], 'MKD': ['Macedonia'], 'CPV': ['Cabo Verde'],
    'TLS': ['East Timor'], 'VAT': ['Vatican', 'Holy See'], 'NLD': ['Holland', 'The Netherlands'],
    'BHS': ['The Bahamas'], 'GMB': ['The Gambia'], 'FSM': ['Federated States of Micronesia'],
    'KOR': ['Korea'], 'PRK': ['Korea'], 'ARE': ['UAE', 'Emirates'], 'STP': ['Sao Tome and Principe'],
    'BIH': ['Bosnia'], 'PSE': ['State of Palestine'], 'UNK': ['Kosova'], 'LAO': ['Lao'],
    'VNM': ['Viet Nam'], 'RUS': ['Russian Federation'], 'KNA': ['St Kitts and Nevis'],
    'LCA': ['St Lucia'], 'VCT': ['St Vincent and the Grenadines'], 'TWN': ['Chinese Taipei'],
}

# Names people may type. English aliases above, plus every language in i18n-iso-countries,
# world-countries translations and Natural Earth's NAME_xx fields. The parts of the UK are
# accepted and counted as the United Kingdom.
import glob
I18N = {}
for f in glob.glob(f'{RAW}/npm/node_modules/i18n-iso-countries/langs/*.json'):
    for a2, nm in load(f)['countries'].items():
        I18N.setdefault(a2, set()).update(nm if isinstance(nm, list) else [nm])
TYPED_EXTRA = {'GBR': ['England', 'Scotland', 'Wales', 'Northern Ireland'], 'USA': ['US', 'United States'],
               'NLD': ['Holland'], 'COD': ['Zaire', 'Congo-Kinshasa', 'Congo Kinshasa'], 'CZE': ['Czech'],
               'KOR': ['Korea South'], 'PRK': ['Korea North'], 'KNA': ['Saint Kitts', 'St Kitts'],
               'TTO': ['Trinidad'], 'ATG': ['Antigua'], 'STP': ['Sao Tome'], 'PNG': ['Papua'],
               'COG': ['Republic of the Congo', 'Congo Brazzaville'], 'IRN': ['Persia'], 'THA': ['Siam'],
               'LKA': ['Ceylon'], 'VCT': ['Saint Vincent', 'St Vincent'], 'TLS': ['Timor'],
               'GNB': ['Guinea Bissau'], 'BIH': ['Herzegovina'], 'MHL': ['Marshall Islands'], 'SLB': ['Solomons']}
SHORT_OK = {'USA', 'US', 'UK', 'UAE', 'DRC', 'PNG', 'CAR', 'RSA'}


def typed_names(k, w, props_list):
    out = set()
    if w:
        out.add(w['name']['common']); out.add(w['name']['official'])
        for a in w.get('altSpellings', []):
            if len(a) > 3 or a in SHORT_OK:
                out.add(a)
        for tr in (w.get('translations') or {}).values():
            out.add(tr.get('common', ''))
        out.update(I18N.get(w['cca2'], set()))
    for pp in props_list:
        for key, val in pp.items():
            if (key.startswith('NAME') and key not in ('NAME_LEN', 'NAME_SORT')) or key in ('ADMIN', 'FORMAL_EN', 'GEOUNIT', 'SUBUNIT'):
                if isinstance(val, str) and val and val != '-99':
                    out.add(val)
    out.update(ALIASES.get(k, []))
    out.update(TYPED_EXTRA.get(k, []))
    keep = set()
    for n in out:
        n = (n or '').strip()
        if not n or not is_latin(n) or len(n) > 32:
            continue
        if len(n) <= 2 or (len(n) == 3 and n.isupper() and n not in SHORT_OK):
            continue
        keep.add(n)
    return sorted(keep)


# Countries with real territory on more than one continent count for each (generous).
EXTRA_CONT = {
    'RUS': ['Asia'], 'TUR': ['Europe'], 'KAZ': ['Europe'], 'AZE': ['Europe'], 'GEO': ['Europe'],
    'ARM': ['Europe'], 'CYP': ['Asia'], 'EGY': ['Asia'], 'IDN': ['Oceania'], 'TLS': ['Oceania'],
    'FRA': ['South America', 'North America', 'Africa'], 'ESP': ['Africa'], 'USA': ['Oceania'],
    'CHL': ['Oceania'], 'NLD': ['North America'], 'TTO': ['South America'],
}
CONT_NOTE = {
    'RUS|Asia': 'most of Russia lies in Asia', 'TUR|Europe': 'East Thrace and part of Istanbul are in Europe',
    'KAZ|Europe': 'its far west lies in Europe', 'AZE|Europe': 'its north lies across the Caucasus watershed',
    'GEO|Europe': 'the Caucasus is often counted as Europe', 'ARM|Europe': 'the Caucasus is often counted as Europe',
    'CYP|Asia': 'the island sits on the Asian side of the sea', 'EGY|Asia': 'the Sinai Peninsula is in Asia',
    'IDN|Oceania': 'Western New Guinea is part of Indonesia', 'TLS|Oceania': 'it is often grouped with Oceania',
    'FRA|South America': 'French Guiana is part of France', 'FRA|North America': 'Guadeloupe and Martinique are part of France',
    'FRA|Africa': 'Réunion and Mayotte are part of France', 'ESP|Africa': 'Ceuta, Melilla and the Canaries are Spanish',
    'USA|Oceania': 'Hawaii is a US state', 'CHL|Oceania': 'Easter Island is part of Chile',
    'NLD|North America': 'Bonaire, Sint Eustatius and Saba are part of the Netherlands',
    'TTO|South America': 'Trinidad sits on the South American shelf',
}
OPEN_OCEAN = {'SYC': 'Africa', 'MUS': 'Africa', 'MDV': 'Asia', 'SHN': 'Africa', 'IOT': 'Asia',
              'SGS': 'South America', 'ATF': 'Antarctica', 'HMD': 'Antarctica'}

# ---------------------------------------------------------------- geometry groups
geo50, geo10, feat_props = {}, {}, {}
for f in ne50:
    p = f['properties']
    if p['ADM0_A3'] in IGNORE:
        continue
    k = oid(p['ADM0_A3'])
    geo50.setdefault(k, []).append(shape(f['geometry']))
    feat_props.setdefault(k, []).append(p)
for f in ne10:
    p = f['properties']
    if p['ADM0_A3'] in IGNORE:
        continue
    geo10.setdefault(oid(p['ADM0_A3']), []).append(shape(f['geometry']))


def main_props(k):
    """Properties of the feature whose code maps to itself (Somalia, not Somaliland)."""
    for p in feat_props[k]:
        if p['ADM0_A3'] == k:
            return p
    return feat_props[k][0]


ids = sorted(geo50)

# Border fixes: world-countries lists a maritime 'border' for Sri Lanka, and leaves out
# France's land borders in South America and on Saint Martin (generous: they are real).
BORDER_ADD = [('FRA', 'BRA'), ('FRA', 'SUR'), ('FRA', 'NLD')]
BORDER_DEL = [('LKA', 'IND')]
for a, b in BORDER_ADD:
    for x, y in ((a, b), (b, a)):
        if x in WC and y not in WC[x]['borders']:
            WC[x]['borders'].append(y)
for a, b in BORDER_DEL:
    for x, y in ((a, b), (b, a)):
        if x in WC and y in WC[x]['borders']:
            WC[x]['borders'].remove(y)
G50 = {k: unary_union(v) for k, v in geo50.items()}
G10 = {k: unary_union(v) for k, v in geo10.items()}


def is_latin(s):
    return all(ord(ch) < 0x250 or unicodedata.category(ch).startswith('M') or ch in "’‘ʻ" for ch in s)


def ascii_fold(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))


# ---------------------------------------------------------------- lines on the globe
ARCTIC, TROPIC, D, DM = 66.563, 23.436, 0.3, 0.1   # generous tolerance: ~33 km for parallels, ~11 km for meridians
BANDS = {
    'eq': box(-180, -D, 180, D),
    'tcn': box(-180, TROPIC - D, 180, TROPIC + D),
    'tcp': box(-180, -TROPIC - D, 180, -TROPIC + D),
    'arc': box(-180, ARCTIC - D, 180, ARCTIC + D),
    'pm': box(-DM, -90, DM, 90),
    'am': box(180 - DM, -90, 180, 90).union(box(-180, -90, -180 + DM, 90)),
}

# ---------------------------------------------------------------- capitals from NE places
# NE marks some former or ceremonial seats as capitals; these are not capitals today.
CAP_EXCLUDE = {'Johannesburg', 'Yangon', 'Kyoto', 'Baguio', 'Lagos', 'Laayoune', 'Bir Lehlou', 'Valparaíso'}
# Where a country has several capitals, the official one goes first.
CAP_PRIMARY = {'ZAF': 'Pretoria', 'BOL': 'Sucre', 'NLD': 'Amsterdam', 'TZA': 'Dodoma', 'CIV': 'Yamoussoukro',
               'MYS': 'Kuala Lumpur', 'BEN': 'Porto-Novo', 'LKA': 'Sri Jayawardenepura Kotte', 'SWZ': 'Mbabane',
               'MMR': 'Naypyidaw', 'ISR': 'Jerusalem'}


def is_capital(p):
    return p['FEATURECLA'] in ('Admin-0 capital', 'Admin-0 capital alt') and p['NAME'] not in CAP_EXCLUDE


cap_by_country = {}
for f in places:
    p = f['properties']
    if is_capital(p):
        k = oid(p['ADM0_A3'])
        cap_by_country.setdefault(k, []).append((p['NAME'], p['LATITUDE'], p['LONGITUDE'], p['FEATURECLA'] == 'Admin-0 capital'))
for k, caps in cap_by_country.items():
    want = CAP_PRIMARY.get(k)
    caps.sort(key=lambda c: (0 if c[0] == want else 1, 0 if c[3] else 1))
PRIMARY_CAP = {k: caps[0][0] for k, caps in cap_by_country.items()}

# ---------------------------------------------------------------- coast distance index
def densify(coords, step_km=2.0):
    out = []
    for (x1, y1), (x2, y2) in zip(coords[:-1], coords[1:]):
        dist = math.hypot((x2 - x1) * math.cos(math.radians((y1 + y2) / 2)), y2 - y1) * 111.2
        n = max(1, int(dist / step_km))
        for i in range(n):
            t = i / n
            out.append((x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))
    out.append(coords[-1])
    return out


def coast_points(geojson_path):
    pts = []
    for f in load(geojson_path)['features']:
        g = f['geometry']
        lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
        for line in lines:
            pts.extend(densify(line))
    return pts


caspian = []
for f in lakes:   # the Caspian is a sea by name, so its shore counts as "the sea"
    if (f['properties'].get('name') or '').startswith('Caspian'):
        geom = shape(f['geometry'])
        polys = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
        for poly in polys:
            caspian.extend(densify(list(poly.exterior.coords)))


def to_xyz(lon, lat):
    lo, la = np.radians(lon), np.radians(lat)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def tree_of(pts):
    a = np.array(pts)
    return cKDTree(to_xyz(a[:, 0], a[:, 1]))


# Fine coastline for distance, coarse coastline as a sanity check: NE's fine coastline
# follows estuaries far inland (Montreal, Hamburg, Dhaka), the coarse one does not,
# while fjord cities like Oslo and Trondheim stay within reach of it.
coast_tree = tree_of(coast_points(f'{RAW}/ne/ne_10m_coastline.geojson') + caspian)
coarse_tree = tree_of(coast_points(f'{RAW}/ne/ne_110m_coastline.geojson') + caspian)


def km_to(tree, lon, lat):
    d, _ = tree.query(to_xyz(np.array([lon]), np.array([lat])))
    return float(2 * math.asin(min(1.0, d[0] / 2)) * 6371.0)


def coast_km(lon, lat):
    return km_to(coast_tree, lon, lat)


from shapely.prepared import prep
coarse_land = prep(unary_union([shape(f['geometry']) for f in load(f'{RAW}/ne/ne_110m_land.geojson')['features']]))


def by_the_sea(lon, lat, tol):
    if coast_km(lon, lat) > tol:
        return False
    # small islands are missing from the coarse map, so only check cities it covers
    return (not coarse_land.contains(Point(lon, lat))) or km_to(coarse_tree, lon, lat) <= 75


# ---------------------------------------------------------------- countries
rng = np.random.default_rng(20261026)


def tap_points(geom, lab, n=10):
    """Points inside the shape, clustered round the label point: where people tap."""
    parts = [geom] if geom.geom_type == 'Polygon' else sorted(geom.geoms, key=lambda g: -g.area)
    target = next((p for p in parts if p.contains(Point(lab))), parts[0])
    if not target.contains(Point(lab)):
        lab = target.representative_point().coords[0]
    sigma = max(0.15, 0.35 * math.sqrt(target.area))
    pts, tries = [], 0
    while len(pts) < n and tries < 400:
        tries += 1
        x, y = rng.normal(lab[0], sigma), rng.normal(lab[1], sigma * 0.8)
        if target.contains(Point(x, y)):
            pts.append([round(x, 2), round(y, 2)])
    return pts or [[round(lab[0], 2), round(lab[1], 2)]]


def flag_cov(cca2):
    cov = FLAGS.get((cca2 or '').lower())
    if not cov:
        return None
    return {k: round(v, 4) for k, v in cov.items() if v >= 0.003 and k != 'gray'}


countries = []
for k in ids:
    if k == 'ATA':
        continue
    p = main_props(k)
    extra = feat_props[k]
    w = WC.get(k)
    sov = k in SOVEREIGN
    name = w['name']['common'] if w else (p.get('NAME_EN') or p['NAME'])
    if k == 'ESH':
        name = 'Western Sahara'
    aliases = {name}
    for cand in (p.get('NAME_EN'), p.get('NAME')):
        if cand and '.' not in cand:
            aliases.add(cand)
    aliases.update(ALIASES.get(k, []))
    cont = OPEN_OCEAN.get(k, p['CONTINENT'])
    conts = [cont] + [c for c in EXTRA_CONT.get(k, []) if c != cont]
    lines = []
    # 10m keeps the small islands that decide these (Grimsey, the Maldives' southern atolls)
    g10 = G10.get(k, G50[k])
    for key, band in BANDS.items():
        if g10.intersects(band):
            lines.append(key)
    pop = sum(max(0, e.get('POP_EST') or 0) for e in extra)
    gdp = sum(max(0, e.get('GDP_MD') or 0) for e in extra)
    lab = (p['LABEL_X'], p['LABEL_Y'])
    parent = None
    if not sov:
        if k == 'ESH':
            parent = 'disputed'
        elif k == 'KAS':
            parent = 'disputed'
        else:
            parent = p.get('SOVEREIGNT') or p.get('ADMIN')
    caps = cap_by_country.get(k, [])
    if k == 'NRU' and not caps:
        caps = [('Yaren', -0.547, 166.920)]
    countries.append({
        'id': k, 'n': name, 'al': sorted(aliases), 's': 1 if sov else 0, 'par': parent,
        'fl': w['flag'] if w else '', 'ct': conts,
        'b': sorted(w['borders']) if w else [], 'll': 1 if (w and w.get('landlocked')) else 0,
        'lg': sorted(set(w['languages'].values())) if w else [],
        'p': int(pop), 'gdp': int(gdp), 'a': int(w['area']) if w and w.get('area') else int(G50[k].area * 12300),
        'cp': [c[0] for c in caps] or (w['capital'] if w else []),
        'cpll': [[round(c[2], 3), round(c[1], 3)] for c in caps],
        'fc': flag_cov(w['cca2'] if w else None), 'ln': lines,
        'lr': p.get('LABELRANK') or 6, 'lab': [round(lab[0], 2), round(lab[1], 2)],
        'tp': tap_points(G50[k], lab), 'q': p.get('WIKIDATAID'),
        'nm': typed_names(k, w, extra),
        'bb': [round(v, 2) for v in G10.get(k, G50[k]).bounds],
    })

# coastal capital (for "a country whose capital is by the sea")
for c in countries:
    c['cpc'] = 1 if any(by_the_sea(x, y, 12) for x, y in c['cpll']) else 0

# salience: how likely an average player is to think of this country
lp = np.array([math.log10(max(c['p'], 1000)) for c in countries])
lg = np.array([math.log10(max(c['gdp'], 100)) for c in countries])
lpn = (lp - lp.min()) / (lp.max() - lp.min())
lgn = (lg - lg.min()) / (lg.max() - lg.min())
for i, c in enumerate(countries):
    rank = 1 - (min(max(c['lr'], 2), 8) - 2) / 6
    c['sal'] = round(float(0.25 * lpn[i] + 0.5 * lgn[i] + 0.25 * rank), 3)
    del c['gdp']

# tiny-country markers so microstates can be tapped at world zoom
tiny_out = []
for f in tiny:
    p = f['properties']
    if p['ADM0_A3'] in IGNORE:
        continue
    k = oid(p['ADM0_A3'])
    if k not in G50:
        continue
    x, y = f['geometry']['coordinates'][:2]
    tiny_out.append({'id': k, 'n': p['NAME'], 'll': [round(x, 3), round(y, 3)]})

# ---------------------------------------------------------------- cities
SKIP_CLASS = {'Scientific station', 'Meteorological Station', 'Historic place'}
cities = []
seen = set()
for f in places:
    p = f['properties']
    fc = p['FEATURECLA']
    if fc in SKIP_CLASS:
        continue
    pop = p['POP_MAX'] or 0
    is_cap = is_capital(p)
    if not (pop >= 15000 or is_cap or fc == 'Admin-0 region capital' or (fc == 'Admin-1 capital' and pop >= 5000)):
        continue
    k = oid(p['ADM0_A3'])
    k = {'SJM': 'NOR', 'GIB': 'GBR', 'TKL': 'NZL'}.get(k, k)   # no own shape on the 1:50m map
    if k not in G50:
        continue
    lon, lat = p['LONGITUDE'], p['LATITUDE']
    area = p.get('MAX_AREAKM') or 0
    ck = coast_km(lon, lat)
    tol = max(10.0, min(30.0, 8 + 0.35 * math.sqrt(max(area, 0))))  # big metros reach the shore
    names = {p['NAME'], p['NAMEASCII'], p.get('NAME_EN') or p['NAME']}
    for alt in (p.get('NAMEALT') or '').split('|'):
        if alt.strip():
            names.add(alt.strip())
    # exonyms in Latin-script languages (Peking, Moskau, Lisboa, Wien ...) for typed answers
    typed = set(names)
    for key, val in p.items():
        if key.startswith('NAME_') and isinstance(val, str) and val and is_latin(val):
            typed.add(val)
    display = ' '.join((p.get('NAME_EN') or p['NAME']).split())   # English name, single spaces
    typed.add(p['NAME'])
    typed.discard(display)
    initials = sorted({ascii_fold(nm).strip().upper()[0] for nm in names if nm and nm.strip()})
    cid = p.get('WIKIDATAID') or f"ne{p['NE_ID']}"
    if cid in seen:
        cid = f"ne{p['NE_ID']}"
    seen.add(cid)
    sea = by_the_sea(lon, lat, tol)
    estuary = (not sea) and ck <= tol   # near tidal water, but far from the open sea
    primary = is_cap and PRIMARY_CAP.get(k) == p['NAME']
    flags = (1 if is_cap else 0) | (2 if sea else 0) | (4 if p['WORLDCITY'] else 0) | (8 if p['MEGACITY'] else 0) | (16 if estuary else 0) | (32 if primary else 0)
    cities.append([cid, display, k, round(lat, 2), round(lon, 2), int(pop), int(p['SCALERANK']), flags,
                   int(round(ck)), ''.join(initials), '|'.join(sorted(typed))])

# ---------------------------------------------------------------- more towns from GeoNames
# Natural Earth leaves out many places players know (Hammerfest, Kirkenes, Ilulissat, a lot of
# 100,000-people cities). geonames_extract.js pulls towns of 60,000+ anywhere and 1,500+ in the
# far north and south; the ones the atlas already has (same name nearby, or anything within
# 6 km) are skipped. They count as valid answers but the Machine almost never picks them.
import os
GN_FILE = f'{RAW}/geo/geonames_extra.json'
added = 0
if os.path.exists(GN_FILE):
    A2 = {c['cca2']: a3 for a3, c in WC.items()}
    A2.update({'XK': 'UNK'})
    ne_pts = [(c[4], c[3]) for c in cities]
    ne_tree = tree_of(ne_pts)
    ne_names = [{ascii_fold(n).lower() for n in [c[1]] + c[10].split('|') if n} for c in cities]

    def fold_name(n):
        return ascii_fold(n).lower().replace('-', ' ').replace(' city', '').strip()

    for gid, name, cc, lat, lon, pop, fcode, _ in load(GN_FILE):
        k = A2.get(cc)
        if not k:
            continue
        k = oid(k)
        k = {'SJM': 'NOR', 'GIB': 'GBR', 'TKL': 'NZL', 'BES': 'NLD'}.get(k, k)
        if k not in G50 or not is_latin(name):
            continue
        q = to_xyz(np.array([lon]), np.array([lat]))
        near = ne_tree.query_ball_point(q[0], 30 / 6371.0)
        dup = False
        fn = fold_name(name)
        for j in near:
            d = km_to(tree_of([ne_pts[j]]), lon, lat)
            names_j = {fold_name(x) for x in ne_names[j]}
            if d <= 6 or fn in names_j or any(fn in x or x in fn for x in names_j if len(x) > 3):
                dup = True
                break
        if dup:
            continue
        ck = coast_km(lon, lat)
        tol = 10.0
        sea = by_the_sea(lon, lat, tol)
        estuary = (not sea) and ck <= tol
        display = ' '.join(name.split())
        typed = {display, ascii_fold(display)}
        typed.discard(display)
        initials = sorted({ascii_fold(display).strip().upper()[0]})
        flags = (2 if sea else 0) | (16 if estuary else 0)
        cities.append([f'gn{gid}', display, k, round(lat, 2), round(lon, 2), int(pop), 10, flags,
                       int(round(ck)), ''.join(initials), '|'.join(sorted(typed))])
        ne_pts.append((lon, lat)); ne_names.append({display.lower()})
        added += 1
    print('geonames towns added', added)

# city salience
pops = np.array([math.log10(max(c[5], 1000)) for c in cities])
popn = np.clip((pops - 4.0) / (7.3 - 4.0), 0, 1)
for i, c in enumerate(cities):
    s = 0.5 * (1 - c[6] / 10) + 0.35 * popn[i] + 0.1 * (1 if c[7] & 4 else 0) + 0.05 * (1 if c[7] & 1 else 0)
    c.append(round(float(s), 3))
cities.sort(key=lambda c: (c[6], -c[5]))   # rows: id, name, country, lat, lon, pop, scalerank, flags, coastKm, initials, typedNames, salience

# ---------------------------------------------------------------- display geometry
feats = []
for k in ids:
    if k == 'ATA':
        continue
    feats.append({'type': 'Feature', 'id': k, 'properties': {}, 'geometry': mapping(G50[k])})
with open(f'{OUT}/geo50.geojson', 'w') as fh:
    json.dump({'type': 'FeatureCollection', 'features': feats}, fh)

# a first draft of the lakes only: scripts/make_water.js replaces them in world.topo.json with the full set.
# (scalerank 0 is the largest lakes, so a missing rank must not be tested with `or`)
def lake_rank(p):
    r = p.get('scalerank')
    return 9 if r is None else r


big_lakes = [f for f in lakes if lake_rank(f['properties']) <= 1
             and not (f['properties'].get('name') or '').startswith('Caspian')]
with open(f'{OUT}/lakes.geojson', 'w') as fh:
    json.dump({'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'properties': {}, 'geometry': mapping(shape(f['geometry']).simplify(0.08))}
        for f in big_lakes]}, fh)

with open(f'{OUT}/countries.json', 'w', encoding='utf-8') as fh:
    json.dump({'countries': countries, 'tiny': tiny_out, 'contNote': CONT_NOTE}, fh, ensure_ascii=False, separators=(',', ':'))
with open(f'{OUT}/cities.json', 'w', encoding='utf-8') as fh:
    json.dump(cities, fh, ensure_ascii=False, separators=(',', ':'))

print('countries', len(countries), 'sovereign', sum(c['s'] for c in countries),
      'tiny', len(tiny_out), 'cities', len(cities), 'coastal cities', sum(1 for c in cities if c[7] & 2),
      'capitals', sum(1 for c in cities if c[7] & 1), 'lakes', len(big_lakes))
