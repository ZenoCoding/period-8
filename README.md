# Repetition

**Repetition** is a beautiful, high-performance, first-person looping horror-puzzle game built for the web. Inspired by *P.T.* and *The Exit 8*, the player must navigate a repeating school hallway and identify anomalies to break the loop and escape.

**Live Demo:** [repetition-tycho.vercel.app](https://repetition-tycho.vercel.app)

---

## Gameplay & Rules

* **Observe the Hallway:** Walk down the hallway and memorize the normal state of all props, lights, lockers, posters, and events.
* **Identify Anomalies:** Pay close attention to subtle shifts:
  * **Environment:** Vents slightly open, missing lockers, warped door handles, or stains forming faces.
  * **Props:** Wall clocks running backwards or displaying incorrect times, posters with shifting eyes.
  * **Threats & Events:** Security cameras tracking your movements, flickering fluorescent lights, or a sudden red flood crashing through the hallway.
  * **NPCs:** A walking figure passing through the side hall whose face is missing or who stares directly at you.
* **Make Your Choice:**
  * **If you spot an anomaly:** Turn back immediately and return through the door you came from.
  * **If everything is normal:** Continue forward to the end of the hallway.
* **Escape the Loop:** Reaching the end of the corridor or turning back correctly advances your progress. A single mistake resets you back to loop zero.

---

## Technical Features

* **Real-time 3D Rendering:** Built on **Three.js** with customized lighting, fog, and materials that dynamically shift between the calm "School" phase and the tense, eerie "Horror" phase.
* **High-Performance Optimizations:** Custom shaders, texture caching, offscreen pre-warming to prevent transition frame drops, and GC-friendly math operations using pre-allocated vector caches.
* **Dynamic Collision & Movement:** Hallway walker physics, transition triggers, and player-collision handling.
* **Audio Integration:** School bell and atmospheric triggers to heighten player immersion.
* **Robust Test Suite:** Performance benchmarks and state-simulation tests run via Vitest.

---

## Tech Stack

* **Framework:** Vanilla JS/TS + Vite
* **3D Library:** Three.js
* **Language:** TypeScript
* **Test Runner:** Vitest

---

## Getting Started

### Installation
Clone the repository and install dependencies:
```bash
npm install
```

### Running Locally
Start the local Vite development server:
```bash
npm run dev
```

### Production Build
Build the optimized production bundle:
```bash
npm run build
```

### Running Tests
Execute unit tests and performance benchmarks:
```bash
npm run test
```
