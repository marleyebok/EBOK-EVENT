"""Bande-son de la vidéo /brag EBOK Event — synthétisée, 120 BPM, la mineur.

Tout est posé sur une seule grille (1 temps = 0,5 s, comptée depuis la 1re image) :
musique et effets (rebonds de ballon, pops des pins, frappes, clics, souffles)
sont dans la même tonalité et passent par la même réverbération.
Usage : python3 soundtrack.py sortie.wav
"""
import sys, wave
import numpy as np

SR = 48000
DUR = 21.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(7)

dry = np.zeros((N, 2))
send = np.zeros((N, 2))  # bus réverbération

def note(n):  # n = numéro MIDI
    return 440.0 * 2 ** ((n - 69) / 12)

def add(sig, t, gain=1.0, pan=0.0, rev=0.0):
    i = int(round(t * SR))
    if i >= N:
        return
    sig = sig[: N - i]
    l, r = gain * np.sqrt(0.5 * (1 - pan)), gain * np.sqrt(0.5 * (1 + pan))
    dry[i:i + len(sig), 0] += sig * l
    dry[i:i + len(sig), 1] += sig * r
    if rev:
        send[i:i + len(sig), 0] += sig * l * rev
        send[i:i + len(sig), 1] += sig * r * rev

def env(n, a, d):
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e

def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); acc = 0.0
    for k in range(len(x)):
        acc = (1 - a) * x[k] + a * acc
        y[k] = acc
    return y

def bandnoise(n, lo, hi):
    x = rng.standard_normal(n)
    X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(X, n)
    return y / (np.abs(y).max() + 1e-9)

# ---------- instruments ----------
def kick(gain=1.0):
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t / 0.22)
    s[: int(0.004 * SR)] += bandnoise(int(0.004 * SR), 1500, 6000) * 0.25
    return np.tanh(1.6 * s) * gain

def clap():
    n = int(0.3 * SR)
    s = bandnoise(n, 900, 5000) * env(n, 0.001, 0.07)
    for d in (0.008, 0.017):  # petits éclats d'un clap
        k = int(d * SR); s[k:] += bandnoise(n - k, 900, 5000) * env(n - k, 0.001, 0.012) * 0.6
    return s * 0.55

def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    return bandnoise(n, 7000, 16000) * env(n, 0.0005, 0.06 if open_ else 0.012) * 0.22

def bounce(gain=1.0):
    """Rebond de ballon sur parquet : impact grave + claquement + résonance de la balle."""
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 62 + 120 * np.exp(-t / 0.018)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.075)
    slap = bandnoise(n, 700, 3500) * np.exp(-t / 0.009) * 0.45
    ring = np.sin(2 * np.pi * 330 * t) * np.exp(-t / 0.05) * 0.12
    return np.tanh(1.4 * (body + slap + ring)) * gain

def pluck(freqs, dur=0.5, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        for h, a in ((1, 1), (2, 0.35 * bright), (3, 0.18 * bright), (4, 0.08 * bright)):
            s += a * np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6))
    return s * env(n, 0.003, 0.16) / len(freqs) * 0.5

def pad(freqs, dur, attack=0.6, release=0.8):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ff = f * 2 ** (det / 12)
            s += np.sin(2 * np.pi * ff * t + rng.uniform(0, 6)) + 0.3 * np.sin(4 * np.pi * ff * t)
    e = np.ones(n)
    na, nr = int(attack * SR), int(release * SR)
    e[:na] = np.linspace(0, 1, na) ** 2; e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return s * e / (3 * len(freqs)) * 0.35

def sub(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    e = np.ones(n); e[: int(0.005 * SR)] = np.linspace(0, 1, int(0.005 * SR))
    nr = int(0.06 * SR); e[-nr:] = np.linspace(1, 0, nr)
    return s * e * 0.5

def blip(f, gain=0.12):
    n = int(0.22 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(4 * np.pi * f * t)) * env(n, 0.002, 0.05) * gain

def tick(gain=0.05):
    n = int(0.03 * SR)
    return bandnoise(n, 2000, 7000) * env(n, 0.0005, 0.006) * gain

def click():
    n = int(0.08 * SR); t = np.arange(n) / SR
    return (bandnoise(n, 1500, 6000) * np.exp(-t / 0.004) * 0.5 + np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.02)) * 0.35

def whoosh(dur=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    fc = 250 + 3200 * (t / dur) ** 2
    for _ in range(3):  # trois pôles : un souffle doux, sans aigus agressifs
        y = np.empty(n); acc = 0.0
        for k in range(n):
            a = np.exp(-2 * np.pi * fc[k] / SR); acc = (1 - a) * x[k] + a * acc; y[k] = acc
        x = y
    y /= np.abs(y).max() + 1e-9
    return y * (t / dur) ** 2 * 0.5

def impact():
    n = int(1.2 * SR); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(40 + 60 * np.exp(-t / 0.05)) / SR) * np.exp(-t / 0.5)
    air = bandnoise(n, 150, 5000) * np.exp(-t / 0.2) * 0.25
    return np.tanh(1.3 * (boom + air)) * 0.9

# ---------- arrangement ----------
A2, C3, E3, F2, G2 = note(45), note(48), note(52), note(41), note(43)
CHORDS = {  # accords (notes MIDI) + basse
    'Am': ([57, 60, 64, 71], note(33)),
    'F':  ([57, 60, 65, 69], note(29)),
    'C':  ([55, 60, 64, 67], note(36)),
    'G':  ([55, 59, 62, 67], note(31)),
}
PROG = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G']
BAR0 = 3.0  # le drop : 1re mesure

# 1) Accroche : l'éclairage s'allume, rebonds de ballon sur chaque temps, nappe qui monte
add(pad([note(57), note(60), note(64)], 3.2, attack=2.6, release=0.3), 0.0, 0.8, rev=0.6)
for i, t in enumerate(np.arange(0.0, 3.0, BEAT)):
    add(bounce(0.55 + 0.07 * i), t, 0.9, pan=-0.1 + 0.04 * i, rev=0.25)
add(bounce(0.6), 2.75, 0.5, rev=0.2)  # double rebond (croche) avant le drop
add(whoosh(1.0), 2.0, 0.35, rev=0.3)

# 2) Drop + boucle (3,0 → 18,0)
add(impact(), 3.0, 0.9, rev=0.4)
for bar, ch in enumerate(PROG):
    t0 = BAR0 + bar * 2 * BEAT * 2
    if t0 >= 18.0:
        break
    tones, bass = CHORDS[ch]
    for e in range(8):  # croches
        t = t0 + e * BEAT / 2
        if t >= 18.0:
            break
        if e in (0, 3, 4):
            add(kick(), t, 0.85)
            add(sub(bass, min(0.5 if e == 4 else 0.74, 18.0 - t)), t, 0.55)
        if e in (2, 6):
            add(clap(), t, 0.8, pan=0.05, rev=0.25)
        add(hat(open_=(e == 7)), t, 0.8 if e % 2 else 0.5, pan=0.3)
        if e in (1, 4, 6):
            add(pluck([note(n) for n in tones], 0.45), t, 0.55, pan=-0.2, rev=0.45)
    # double-croches de charleston en fin de 2e mesure
    if bar % 2 == 1:
        for k in range(4):
            add(hat(), t0 + 1.5 + k * 0.125 + 0.0625, 0.45, pan=0.35)
    add(pad([note(n) for n in tones[:3]], min(2.0, 18.0 - t0) + 0.3, attack=0.3, release=0.5), t0, 0.45, rev=0.5)

# 3) Pins : un « pop » par pin (triple-croches), pentatonique de la mineur qui monte
PENTA = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91]
for i in range(20):
    add(blip(note(PENTA[i % len(PENTA)] + (12 if i >= 10 else 0) - 12), 0.11), 6.5 + i * 0.0625, 1, pan=-0.5 + i * 0.05, rev=0.5)

# 4) Souffles sur les coupes + clics du curseur
for t in (6.0, 10.0, 13.5, 18.0):
    add(whoosh(0.5), t - 0.5, 0.3, rev=0.3)
for t in (9.5, 15.5):
    add(click(), t, 0.8, rev=0.15)
add(blip(note(81), 0.18), 9.5, 1, rev=0.5)  # sélection du pin de Montpellier

# 5) Frappes au clavier (14 caractères, une par triple-croche à partir de 14,25 s)
for i in range(14):
    add(tick(0.06), 14.25 + i * 0.0625, 1, pan=0.2 + rng.uniform(-0.1, 0.1), rev=0.1)

# 6) Confirmation : carillon en la mineur (add9)
for k, n in enumerate([69, 72, 76, 83]):
    add(blip(note(n), 0.16), 15.75 + k * 0.0625, 1, pan=-0.2 + 0.13 * k, rev=0.7)

# 7) Final : impact sur 18,0, accord tenu, rebonds qui s'éloignent
add(impact(), 18.0, 0.85, rev=0.5)
add(kick(), 18.0, 0.8)
add(sub(note(33), 1.5), 18.0, 0.5)
add(pad([note(57), note(60), note(64), note(71)], 3.0, attack=0.05, release=2.2), 18.0, 0.9, rev=0.7)
add(pluck([note(n) for n in (57, 60, 64, 71)], 1.2), 18.0, 0.7, rev=0.6)
for k, t in enumerate((19.0, 19.5, 20.0, 20.25, 20.375)):
    add(bounce(0.45 * 0.8 ** k), t, 0.8, pan=0.3, rev=0.4)

# ---------- réverbération + mastering ----------
def ir(seed):
    r = np.random.default_rng(seed); n = int(1.1 * SR); t = np.arange(n) / SR
    h = r.standard_normal(n) * np.exp(-t / 0.32); h[: int(0.012 * SR)] = 0
    return h / np.sqrt((h ** 2).sum())
wet = np.zeros_like(send)
for c, seed in ((0, 1), (1, 2)):
    L = N + len(ir(seed)); F = 1 << (L - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(send[:, c], F) * np.fft.rfft(ir(seed), F), F)[:N]
    wet[:, c] = y
mix = dry + 0.35 * wet
# fondu de fin
fade = np.ones(N); nf = int(0.6 * SR); fade[-nf:] = np.linspace(1, 0, nf) ** 2
mix *= fade[:, None]
mix = np.tanh(mix / (np.abs(mix).max() * 0.85))
mix *= 0.89 / np.abs(mix).max()
out = (mix * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('ok', DUR, 's')
