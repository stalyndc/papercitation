document.addEventListener("DOMContentLoaded", () => {
  if (!window.anime || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const fadeUpTargets = [
    ".page-header",
    ".content-main",
    ".login-main",
    ".saved-card",
    ".blog-card",
    ".result-card",
    ".popular-claims",
    ".stats-grid",
    ".utility-bar.is-active"
  ];

  anime({
    targets: fadeUpTargets.join(", "),
    translateY: [12, 0],
    opacity: [0, 1],
    duration: 700,
    delay: anime.stagger(60, { start: 120 }),
    easing: "easeOutQuad"
  });

  animateOnView(".result-card");
  animateOnView(".saved-card");
  animateOnView(".blog-card");

  function animateOnView(selector) {
    const elements = document.querySelectorAll(selector);
    if (!elements.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            anime({
              targets: entry.target,
              translateY: [12, 0],
              opacity: [0, 1],
              duration: 600,
              easing: "easeOutQuad"
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 }
    );
    elements.forEach((el) => observer.observe(el));
  }
});
