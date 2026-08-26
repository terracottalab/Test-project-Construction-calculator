(function () {
    const greeting = document.getElementById("greeting");
    const resume = document.getElementById("resumeCard");
    const resumeTotal = document.getElementById("resumeTotal");
    const resumeRows = document.getElementById("resumeRows");
    const nav = document.getElementById("siteNav");
    const navToggle = document.getElementById("navToggle");
    const demoButton = document.getElementById("demoButton");
    const year = document.getElementById("year");

    const hour = new Date().getHours();
    let hello = "Добрый день";

    if (hour < 5 || hour >= 22) {
        hello = "Доброй ночи";
    } else if (hour < 12) {
        hello = "Доброе утро";
    } else if (hour >= 18) {
        hello = "Добрый вечер";
    }

    if (greeting) {
        greeting.textContent = hello + ", Мария";
    }

    const saved = readSavedBudget();
    if (saved && Array.isArray(saved.rows) && saved.rows.length) {
        const total = saved.rows.reduce(
            (sum, row) => sum + (Number(row.total) || 0),
            0
        );

        resumeTotal.textContent = formatMoneyRu(total);
        resumeRows.textContent = String(saved.rows.length);
        resume.classList.add("is-visible");
    }

    if (year) {
        year.textContent = String(new Date().getFullYear());
    }

    navToggle?.addEventListener("click", () => {
        nav?.classList.toggle("is-open");
    });

    demoButton?.addEventListener("click", () => {
        applyDemoBudget({ replace: false });
    });
})();
