"""Bande-son de la vidéo /brag EBOK Event v2 (« tableau du coach ») — synthétisée, 120 BPM, ré mineur.

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

# ---------- instruments propres à la v2 ----------
def whistle(dur=0.35):
    """Sifflet d'arbitre (sifflet à bille : trille rapide)."""
    n = int(dur * SR); t = np.arange(n) / SR
    f = 3000 + 120 * np.sin(2 * np.pi * 38 * t)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.75 + 0.25 * np.sin(2 * np.pi * 38 * t))
    s += bandnoise(n, 2500, 4500) * 0.12
    e = np.ones(n); a = int(0.01 * SR); r = int(0.05 * SR)
    e[:a] = np.linspace(0, 1, a); e[-r:] = np.linspace(1, 0, r)
    return lowpass(s * e, 6000) * 0.5

def rhodes(freqs, dur=1.9):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        s += np.sin(2 * np.pi * f * t) * np.exp(-t / 1.4)
        s += 0.25 * np.sin(2 * np.pi * f * 7.0 * t) * np.exp(-t / 0.08)  # « tine »
    s *= 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)  # trémolo
    e = np.ones(n); r = int(0.15 * SR); e[-r:] = np.linspace(1, 0, r); e[:int(0.004 * SR)] = np.linspace(0, 1, int(0.004 * SR))
    return s * e / len(freqs) * 0.55

def wood(f, gain=0.14):
    n = int(0.25 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 3.9 * t) * np.exp(-t / 0.01)) * np.exp(-t / 0.06) * gain

def squeak():
    """Crissement de chaussure sur le parquet."""
    n = int(0.13 * SR); t = np.arange(n) / SR
    f = 2300 + 900 * (t / t[-1]) + 160 * np.sin(2 * np.pi * 55 * t)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / t[-1]) ** 0.7
    return lowpass(s, 5000) * 0.22

def chalk(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = bandnoise(n, 1800, 6000) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 7 * t)))
    e = np.ones(n); a = int(0.05 * SR); e[:a] = np.linspace(0, 1, a); e[-a:] = np.linspace(1, 0, a)
    return s * e * 0.03

def swish():
    """Le filet : souffle bref et doux."""
    n = int(0.35 * SR); t = np.arange(n) / SR
    s = bandnoise(n, 1500, 7000) * (t / 0.03).clip(0, 1) * np.exp(-t / 0.09)
    return lowpass(s, 6500) * 0.5

def buzzer(dur=0.55):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sign(np.sin(2 * np.pi * 196 * t)) + 0.6 * np.sign(np.sin(2 * np.pi * 247 * t))
    e = np.ones(n); a = int(0.01 * SR); r = int(0.12 * SR); e[:a] = np.linspace(0, 1, a); e[-r:] = np.linspace(1, 0, r)
    return lowpass(lowpass(s * e, 1400), 1400) * 0.18

# ---------- arrangement ----------
CH = {  # ré mineur : Rém9 – Sib7M – Solm9 – La7
    'Dm9':   ([50, 53, 57, 60, 64], note(38)),
    'Bbmaj7':([46, 50, 53, 57], note(34)),
    'Gm9':   ([43, 46, 50, 53, 57], note(31)),
    'A7':    ([45, 49, 52, 55], note(33)),
}
PROG = ['Dm9', 'Bbmaj7', 'Gm9', 'A7', 'Dm9', 'Bbmaj7', 'Gm9', 'A7']

# 1) Accroche : coup de sifflet, la craie trace le terrain, les joueurs se placent
add(whistle(0.22), 0.0, 0.8, rev=0.35)
add(whistle(0.38), 0.25, 0.8, rev=0.35)
add(chalk(1.8), 0.1, 1, pan=-0.2, rev=0.1)
for i, n_ in enumerate([62, 65, 67, 69, 72]):
    add(wood(note(n_)), 0.9 + i * 0.125, 1, pan=-0.4 + 0.2 * i, rev=0.4)
add(pad([note(50), note(53), note(57)], 3.1, attack=2.4, release=0.3), 0.0, 0.7, rev=0.6)
add(whoosh(1.0), 2.0, 0.3, rev=0.3)

# 2) Groove en demi-temps (3,0 → 17,75)
add(impact(), 3.0, 0.7, rev=0.4)
END = 17.75
for bar, ch in enumerate(PROG):
    t0 = 3.0 + bar * 2.0
    if t0 >= END:
        break
    tones, bass = CH[ch]
    add(rhodes([note(n_) for n_ in tones], min(1.95, END - t0 + 0.2)), t0, 0.75, pan=-0.15, rev=0.5)
    add(rhodes([note(n_ + 12) for n_ in tones[1:3]], 0.9), t0 + 1.25, 0.35, pan=0.2, rev=0.5)
    for e in range(8):
        t = t0 + e * 0.25
        if t >= END:
            break
        if e in (0, 5):
            add(kick(), t, 0.8)
            add(sub(bass, min(0.7, END - t)), t, 0.55)
        if e == 4:
            add(clap(), t, 0.85, rev=0.3)
        add(hat(open_=(e == 7)), t, 0.65 if e % 2 else 0.4, pan=0.3)
    add(hat(), t0 + 1.875, 0.3, pan=0.35)  # petite double-croche fantôme

# 3) Temps de jeu
for t in (3.5, 4.0, 4.5, 5.0):            # ① dribble
    add(bounce(0.55), t, 0.75, pan=-0.1, rev=0.2)
add(chalk(1.4), 3.6, 0.8, rev=0.1)
PENTA = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84]
for i in range(20):                        # pins
    add(blip(note(PENTA[i % 10] + (12 if i >= 10 else 0) - 12), 0.1), 5.25 + i * 0.0625, 1, pan=-0.5 + i * 0.05, rev=0.5)
add(click(), 7.0, 0.7, rev=0.15)           # tap sur le pin
add(whoosh(0.5), 7.0, 0.25, rev=0.3)       # changement de page
add(chalk(0.75), 7.6, 0.8, rev=0.1)        # ② passe
add(whoosh(0.5), 11.0, 0.25, rev=0.3)
add(chalk(0.6), 11.6, 0.8, rev=0.1)        # ③ écran
add(squeak(), 12.25, 1, pan=0.2, rev=0.3)  #    coupe
add(squeak(), 12.75, 0.8, pan=0.3, rev=0.3)
for i in range(14):                        #    frappe
    add(tick(0.05), 12.25 + i * 0.0625, 1, pan=-0.2, rev=0.1)
add(click(), 14.25, 0.7, rev=0.15)         #    « Publier l'événement »
for k, n_ in enumerate([62, 65, 69, 76]):  #    confirmation
    add(blip(note(n_ + 12), 0.15), 14.5 + k * 0.0625, 1, pan=-0.2 + 0.13 * k, rev=0.7)
add(chalk(0.6), 15.5, 0.8, rev=0.1)        # ④ passe
add(whoosh(0.5), 16.25, 0.25, rev=0.3)     #    tir
add(swish(), 16.75, 1, rev=0.4)            #    filet
add(impact(), 16.75, 0.5, rev=0.5)
add(rhodes([note(n_ + 12) for n_ in (50, 53, 57, 64)], 1.0), 16.75, 0.5, rev=0.6)

# 4) Final : buzzer du shot clock, accord tenu
add(buzzer(), 18.0, 1, rev=0.3)
add(kick(), 18.0, 0.7)
add(sub(note(38), 1.6), 18.0, 0.5)
add(pad([note(50), note(53), note(57), note(64)], 3.0, attack=0.05, release=2.2), 18.0, 0.9, rev=0.7)
add(rhodes([note(n_) for n_ in (50, 53, 57, 60, 64)], 2.9), 18.0, 0.8, rev=0.6)
for k, t in enumerate((19.0, 19.5, 20.0, 20.25, 20.375)):
    add(bounce(0.4 * 0.8 ** k), t, 0.8, pan=0.3, rev=0.4)

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
