# Period 8

**Period 8** is a beautiful, high-performance, first-person looping horror-puzzle game built for the web. Inspired by *P.T.* and *The Exit 8*, the player must navigate a repeating school hallway and identify anomalies to break the loop and escape. Created as part of a multigenre project.

**Live Demo:** [repetition-tycho.vercel.app](https://repetition-tycho.vercel.app)

---

## Artist Statement

> Period 8 is an exploration of the existential dread that we get from both repetition and change. Heavily inspired by the award-winning game The Exit 8, Period 8 uses liminal spaces and a spot-the-difference concept to create fear without jumpscares or traditional horror. There’s nothing life-threatening or harmful in the hallways, just an infinite repetition of them. Liminal spaces grant an aesthetic of normal things that present themselves in strange ways, lending itself to the ideas of absurdity. Period 8 applies this to a school setting.
> 
> My goal with this project was to create a high-quality game that allowed people to experience this two-sourced dread firsthand. I wanted them to experience horror, but not in the conventional sense, and encourage the player to think about what causes this fear, as it isn’t as obvious as other horror games. Asking why the seemingly infinite repetition of a simple hallway is so scary, while also fearing the small changes in it and being forced to turn away, shines light on a tension that isn’t seen in many other places. People are afraid to change, and find comfort in their habits, but are also afraid of stagnation. The key is finding a balance—avoiding change that is dangerous, that poses a threat, but paying enough attention and being aware of the small incremental steps in everyday life that indicate forward progress, and are what allow habit to build something meaningful. The fidelity of the game was important, as it had to be realistic enough to take seriously, but not so realistic that the project would be unmanageable.
> 
> I started building this project with the concept of a man running around an orbit, infinitely repeating this orbit to collect space rocks to grow slowly. But I felt that the metaphor was too direct, and scrapped that prototype in favor of the hallway, which was more ambitious, but I felt conveyed what I wanted to say in a more effective manner. From a creative perspective, this project was built with lots of direct inspiration from The Exit 8 and their wiki. All assets, textures, and game art were either procedurally generated in code or found online through free libraries with permissible licensing. The game was built in three.js and vite to make it easy to build and run in the browser, with help from Codex to write code quickly and keep the scope of the project manageable. As for challenges, at first I found it difficult to make the game hard— it was too easy to spot anomalies, and the artwork made things stand out. But with textures, shaders and lighting implemented, and more subtle care for the anomalies and the addition of more assets to pay attention to, the game has become completable in a reasonable amount of time without being so short as to not be able to induce any of the feelings desired.
> 
> Through this project, I learned that repetition is not only scary, but also wonderful. Through the development and iteration of the game I went through the hallways nearly hundreds of times, and seeing it transform from my initial concept into a polished product is representative of what I was trying to convey. It was the small attention to detail and the repetition that allowed me to build something of this caliber, and I am proud of not only the end result, but also the process through which I built it. Making video games is hard. There are so many things to think about when building them— performance, art, sound, and a cohesiveness that ties it all together to make something that should not only be interesting but also entertaining. Giving the player the freedom to interact with your art allows them to break it in ways that you did not expect, which makes it all the more difficult to control the player experience. At the same time, it adds a new level of emotional connection that is inaccessible through other mediums, which is beautiful yet so hard to get right simultaneously. Next time, I hope to be more original in my concept and build something that speaks more creatively to what I’m trying to convey, and focus more on the message past the game itself.

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
