const DEMO_STORAGE_KEY = "renovationBudgetData";

const DEMO_BUDGET = {
    nextId: 12,
    files: ["demo-smeta.csv"],
    documentChecks: [
        {
            source: "demo-smeta.csv",
            documentTotal: 487400,
            totalLabel: "Итого по смете"
        }
    ],
    rows: [
        {
            id: 1,
            date: "2026-03-12",
            category: "Работы",
            workType: "Демонтаж",
            name: "Демонтаж старой плитки в санузле",
            quantity: 18,
            unit: "м²",
            price: 650,
            total: 11700,
            source: "demo-smeta.csv",
            needsReview: false,
            reviewReason: ""
        },
        {
            id: 2,
            date: "2026-03-14",
            category: "Работы",
            workType: "Электрика",
            name: "Прокладка кабеля и установка точек",
            quantity: 24,
            unit: "шт.",
            price: 1800,
            total: 43200,
            source: "demo-smeta.csv",
            needsReview: false,
            reviewReason: ""
        },
        {
            id: 3,
            date: "2026-03-18",
            category: "Материалы",
            workType: "Электрика",
            name: "Кабель, автоматы и подрозетники",
            quantity: 1,
            unit: "комплект",
            price: 28600,
            total: 28600,
            source: "demo-smeta.csv",
            needsReview: false,
            reviewReason: ""
        },
        {
            id: 4,
            date: "2026-04-02",
            category: "Работы",
            workType: "Сантехника",
            name: "Разводка труб и установка смесителей",
            quantity: 1,
            unit: "комплект",
            price: 54000,
            total: 54000,
            source: "demo-smeta.csv",
            needsReview: false,
            reviewReason: ""
        },
        {
            id: 5,
            date: "2026-04-05",
            category: "Материалы",
            workType: "Сантехника",
            name: "Трубы, фитинги, гидроизоляция",
            quantity: 1,
            unit: "комплект",
            price: 31800,
            total: 31800,
            source: "demo-smeta.csv",
            needsReview: false,
            reviewReason: ""
        },
        {
            id: 6,
            date: "2026-04-20",
            category: "Работы",
            workType: "Плиточные работы",
            name: "Укладка керамогранита на пол",
            quantity: 42,
            unit: "м²",
            price: 2100,
            total: 88200,
            source: "demo-smeta.csv",
            needsReview: false,
            reviewReason: ""
        },
        {
            id: 7,
            date: "2026-04-22",
            category: "Материалы",
            workType: "Плиточные работы",
            name: "Керамогранит 60×60",
            quantity: 45,
            unit: "м²",
            price: 2890,
            total: 130050,
            source: "demo-smeta.csv",
            needsReview: false,
            reviewReason: ""
        },
        {
            id: 8,
            date: "2026-05-08",
            category: "Доставка и логистика",
            workType: "Плиточные работы",
            name: "Доставка и подъём материалов",
            quantity: 1,
            unit: "рейс",
            price: 8500,
            total: 8500,
            source: "demo-smeta.csv",
            needsReview: false,
            reviewReason: ""
        },
        {
            id: 9,
            date: "2026-05-15",
            category: "Работы",
            workType: "Покраска",
            name: "Шпаклёвка и окраска стен",
            quantity: 68,
            unit: "м²",
            price: 950,
            total: 64600,
            source: "demo-smeta.csv",
            needsReview: false,
            reviewReason: ""
        },
        {
            id: 10,
            date: "2026-05-16",
            category: "Материалы",
            workType: "Покраска",
            name: "Грунт и краска",
            quantity: 1,
            unit: "комплект",
            price: 26750,
            total: 26750,
            source: "demo-smeta.csv",
            needsReview: false,
            reviewReason: ""
        }
    ],
    prepayments: [
        {
            id: 11,
            date: "2026-03-10",
            amount: 120000,
            counterparty: "Бригада Иванова",
            workType: "Электрика",
            comment: "Аванс по договору, первый этап"
        }
    ]
};

function readSavedBudget() {
    try {
        const stored = localStorage.getItem(DEMO_STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        return null;
    }
}

function formatMoneyRu(value) {
    return new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: 0
    }).format(Number(value) || 0) + " ₽";
}

function applyDemoBudget({ replace = false, redirect = "app.html" } = {}) {
    const existing = readSavedBudget();
    const hasData = Boolean(existing && (existing.rows?.length || existing.prepayments?.length));

    if (hasData && !replace) {
        const confirmed = window.confirm(
            "В браузере уже есть сохранённые данные. Заменить их демо-сметой?"
        );

        if (!confirmed) {
            window.location.href = redirect;
            return;
        }
    }

    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(DEMO_BUDGET));
    window.location.href = redirect;
}
