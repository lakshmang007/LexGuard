// Scroll animations shared by the web app and the extension pages:
// a four-colour scroll progress bar, cards that slide in as they scroll into view,
// and a score ring that counts up. Everything is skipped when the user prefers reduced motion.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SELECTOR = ".input, .summary, .topq, .toolbar, .doc, .card";

  const bar = document.createElement("div");
  bar.className = "scroll-progress";
  document.body.prepend(bar);
  const updateBar = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener("scroll", updateBar, { passive: true });
  addEventListener("resize", updateBar);

  function countUp(score) {
    const target = Number(score.dataset.score) || 0;
    const num = score.querySelector(".num");
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 900);
      const v = Math.round(target * (1 - (1 - t) ** 3));
      score.style.setProperty("--p", v);
      if (num) num.textContent = v;
      if (t < 1) requestAnimationFrame(step);
    };
    score.style.setProperty("--p", 0);
    requestAnimationFrame(step);
    // Background tabs pause animation frames; make sure the real score always ends up on screen.
    setTimeout(() => {
      score.style.setProperty("--p", target);
      if (num) num.textContent = target;
    }, 1200);
  }

  const io = reduce ? null : new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      io.unobserve(e.target);
      const score = e.target.querySelector(".score[data-score]");
      if (score) { score.classList.add("in"); countUp(score); }
    }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });

  function scan() {
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (el.dataset.motion) continue;
      el.dataset.motion = "1";
      if (reduce) continue;
      // Stagger siblings that appear together, such as a fresh list of cards.
      const siblings = [...el.parentElement.children].filter((c) => c.matches(SELECTOR));
      el.style.setProperty("--delay", `${Math.min(siblings.indexOf(el), 6) * 70}ms`);
      el.classList.add("reveal");
      io.observe(el);
    }
    updateBar();
  }

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
