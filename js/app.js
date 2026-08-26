/* ============================================================
   НАСТРОЙКА PDF.JS
============================================================ */

pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


/* ============================================================
   КАТЕГОРИИ РАСХОДОВ
============================================================ */

const EXPENSE_CATEGORIES = [
    "Работы",
    "Материалы",
    "Доставка и логистика",
    "Аренда инструмента",
    "Проект и согласования",
    "Мебель и техника",
    "Прочее"
];


const CHART_COLORS = [
    "#2563eb",
    "#16a34a",
    "#ea580c",
    "#7c3aed",
    "#db2777",
    "#0891b2",
    "#ca8a04",
    "#4b5563"
];


/* ============================================================
   ГЛОБАЛЬНЫЕ ДАННЫЕ
============================================================ */

let estimateRows = [];
let prepayments = [];
let loadedFiles = new Set();
let documentChecks = [];
let currentPdfSource = "";

let nextId = 1;

/* Экземпляры графиков, чтобы корректно перерисовывать canvas */
let charts = {
    category: null,
    workType: null,
    timeline: null,
    balance: null
};


/* ============================================================
   ЭЛЕМЕНТЫ ИНТЕРФЕЙСА
============================================================ */

const workTypeInput = document.getElementById("workType");
const defaultCategory = document.getElementById("defaultCategory");
const estimateDate = document.getElementById("estimateDate");
const fileInput = document.getElementById("fileInput");
const analyzeButton = document.getElementById("analyzeButton");

const tableBody = document.getElementById("tableBody");
const prepayTableBody = document.getElementById("prepayTableBody");

const rowsCount = document.getElementById("rowsCount");
const workTypesCount = document.getElementById("workTypesCount");
const filesCount = document.getElementById("filesCount");
const grandTotal = document.getElementById("grandTotal");
const prepayTotal = document.getElementById("prepayTotal");
const balanceTotal = document.getElementById("balanceTotal");
const paidProgress = document.getElementById("paidProgress");
const paidHint = document.getElementById("paidHint");
const prepayCountHint = document.getElementById("prepayCountHint");

const groupSummary = document.getElementById("groupSummary");
const categorySummary = document.getElementById("categorySummary");
const documentReconciliation = document.getElementById("documentReconciliation");
const workFilter = document.getElementById("workFilter");
const categoryFilter = document.getElementById("categoryFilter");

const statusBox = document.getElementById("status");

const pdfPanel = document.getElementById("pdfPanel");
const pdfText = document.getElementById("pdfText");

const prepayDate = document.getElementById("prepayDate");
const prepayAmount = document.getElementById("prepayAmount");
const prepayCounterparty = document.getElementById("prepayCounterparty");
const prepayWorkType = document.getElementById("prepayWorkType");
const prepayComment = document.getElementById("prepayComment");
const prepayEmptyHint = document.getElementById("prepayEmptyHint");


/* ============================================================
   ОБЯЗАТЕЛЬНЫЙ ВИД РАБОТ
============================================================ */

workTypeInput.addEventListener("input", () => {

    const hasWorkType =
        workTypeInput.value.trim().length > 0;

    fileInput.disabled = !hasWorkType;

    updateAnalyzeButton();

});


fileInput.addEventListener("change", updateAnalyzeButton);


function updateAnalyzeButton() {

    const hasWorkType =
        workTypeInput.value.trim().length > 0;

    const hasFile =
        fileInput.files.length > 0;

    analyzeButton.disabled =
        !(hasWorkType && hasFile);
}


/* ============================================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
============================================================ */

function showStatus(message) {

    statusBox.style.display = "block";
    statusBox.textContent = message;

}


function todayISO() {

    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");

    return (
        date.getFullYear() +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        pad(date.getDate())
    );

}


function normalizeHeader(value) {

    return String(value ?? "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[._]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

}


function parseNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    let text = String(value).trim();
    let negative = false;

    if (/^\(.*\)$/.test(text)) {
        negative = true;
        text = text.slice(1, -1);
    }

    text = text
        .replace(/[₽$€]/g, "")
        .replace(/[\s\u00A0']/g, "")
        .replace(/[^\d,\.\-+]/g, "");

    if (!text || !/^[+-]?\d[\d,.]*$/.test(text)) {
        return null;
    }

    const sign = text.startsWith("-") ? -1 : 1;
    text = text.replace(/^[+-]/, "");

    const commaCount = (text.match(/,/g) || []).length;
    const dotCount = (text.match(/\./g) || []).length;
    let decimalSeparator = "";

    if (commaCount && dotCount) {
        decimalSeparator =
            text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    }

    else if (commaCount || dotCount) {

        const separator = commaCount ? "," : ".";
        const parts = text.split(separator);

        const looksLikeThousands =
            parts.length > 2 &&
            parts.slice(1).every((part) => part.length === 3);

        decimalSeparator = looksLikeThousands ? "" : separator;

    }

    if (decimalSeparator) {

        const decimalIndex = text.lastIndexOf(decimalSeparator);
        const integerPart = text
            .slice(0, decimalIndex)
            .replace(/[,.]/g, "");
        const fractionalPart = text
            .slice(decimalIndex + 1)
            .replace(/[,.]/g, "");

        text = integerPart + "." + fractionalPart;

    }

    else {
        text = text.replace(/[,.]/g, "");
    }

    const result = Number(text) * sign * (negative ? -1 : 1);

    return Number.isFinite(result)
        ? result
        : null;
}


function formatMoney(value) {

    const number =
        Number(value) || 0;

    return new Intl.NumberFormat(
        "ru-RU",
        {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }
    ).format(number) + " ₽";
}


function formatNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "";
    }

    return new Intl.NumberFormat(
        "ru-RU",
        {
            maximumFractionDigits: 3
        }
    ).format(value);
}


function getDocumentTotalLabelScore(value) {

    const text = normalizeHeader(value);

    if (!text) return 0;

    if (/итого по смете|всего к оплате|итого к оплате/.test(text)) {
        return 100;
    }

    if (/общая стоимость|итоговая стоимость|всего с ндс/.test(text)) {
        return 90;
    }

    if (/^итого(?:\s|$|[:\-])/.test(text)) return 65;
    if (/^всего(?:\s|$|[:\-])/.test(text)) return 60;

    return 0;

}


function findDeclaredTotalInRows(rows, preferredColumnIndex = -1) {

    let best = null;

    rows.forEach((row, rowIndex) => {

        const values = Array.isArray(row)
            ? row
            : row.items.map((item) => item.text);

        const joined = values.map((value) => String(value ?? "")).join(" ");
        const score = getDocumentTotalLabelScore(joined);

        if (!score) return;

        let total = null;

        if (preferredColumnIndex !== -1) {
            total = parseNumber(values[preferredColumnIndex]);
        }

        if (total === null) {
            for (let i = values.length - 1; i >= 0; i--) {
                const parsed = parseNumber(values[i]);
                if (parsed !== null) {
                    total = parsed;

                    if (
                        !Array.isArray(row) &&
                        i > 0 &&
                        isPurePdfNumber(values[i - 1]) &&
                        isPurePdfNumber(values[i])
                    ) {

                        const previousItem = row.items[i - 1];
                        const currentItem = row.items[i];
                        const gap = currentItem.x - (
                            previousItem.x + (previousItem.width || 0)
                        );

                        if (gap >= -2 && gap <= 18) {
                            total = parseNumber(
                                `${values[i - 1]} ${values[i]}`
                            );
                        }

                    }

                    break;
                }
            }
        }

        if (total === null) return;

        if (
            !best ||
            score > best.score ||
            (score === best.score && rowIndex > best.rowIndex)
        ) {
            best = {
                value: total,
                label: normalizePositionName(joined),
                score,
                rowIndex
            };
        }

    });

    return best;

}


function setDocumentCheck(source, detectedTotal) {

    const nextCheck = {
        source,
        documentTotal: detectedTotal?.value ?? null,
        totalLabel: detectedTotal?.label || ""
    };

    const existingIndex = documentChecks.findIndex(
        (item) => item.source === source
    );

    if (existingIndex === -1) {
        documentChecks.push(nextCheck);
    }
    else {
        documentChecks[existingIndex] = nextCheck;
    }

}


function getRecognizedTotalForSource(source) {

    const prefix = `${source} /`;

    return estimateRows
        .filter((row) => String(row.source || "").startsWith(prefix))
        .reduce((sum, row) => sum + (Number(row.total) || 0), 0);

}


/*
    Приводит дату из Excel / текста к формату YYYY-MM-DD.
    Пустые и нераспознанные значения остаются пустыми.
*/
function toISODate(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "";
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {

        const pad = (n) => String(n).padStart(2, "0");

        return (
            value.getFullYear() +
            "-" +
            pad(value.getMonth() + 1) +
            "-" +
            pad(value.getDate())
        );

    }

    if (typeof value === "number" && Number.isFinite(value)) {

        const utc = new Date(
            Math.round((value - 25569) * 86400 * 1000)
        );

        if (!Number.isNaN(utc.getTime())) {
            return utc.toISOString().slice(0, 10);
        }

    }

    const text = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return text;
    }

    const ruMatch = text.match(
        /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/
    );

    if (ruMatch) {

        const day = ruMatch[1].padStart(2, "0");
        const month = ruMatch[2].padStart(2, "0");
        let year = ruMatch[3];

        if (year.length === 2) {
            year = "20" + year;
        }

        return year + "-" + month + "-" + day;

    }

    const parsed = new Date(text);

    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return "";

}


function monthKey(isoDate) {

    if (!isoDate || isoDate.length < 7) {
        return "";
    }

    return isoDate.slice(0, 7);

}


function formatMonth(key) {

    const [year, month] = key.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);

    return date.toLocaleDateString("ru-RU", {
        month: "short",
        year: "numeric"
    });

}


function getAllCategories() {

    const extra = estimateRows
        .map((row) => row.category)
        .filter(Boolean);

    return [
        ...new Set([
            ...EXPENSE_CATEGORIES,
            ...extra
        ])
    ];

}


function fillCategorySelect(select, selectedValue, includeAllOption) {

    const current = selectedValue ?? select.value;

    select.innerHTML = "";

    if (includeAllOption) {

        const all = document.createElement("option");
        all.value = "";
        all.textContent = "Все категории";
        select.appendChild(all);

    }

    getAllCategories().forEach((name) => {

        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.appendChild(option);

    });

    if (
        current &&
        [...select.options].some((option) => option.value === current)
    ) {
        select.value = current;
    }

}


/* ============================================================
   СЛОВАРЬ ВОЗМОЖНЫХ НАЗВАНИЙ КОЛОНОК EXCEL
============================================================ */

const COLUMN_RULES = {

    positionNumber: [
        "номер позиции",
        "номер",
        "п п",
        "n"
    ],

    workType: [
        "вид работ",
        "тип работ",
        "раздел",
        "группа"
    ],

    category: [
        "категория расходов",
        "статья расходов",
        "тип затрат",
        "статья"
    ],

    date: [
        "дата",
        "дата сметы",
        "дата операции",
        "дата работ"
    ],

    name: [
        "наименование",
        "наименование работ",
        "наименование материала",
        "работа",
        "материал",
        "позиция",
        "описание"
    ],

    quantity: [
        "количество",
        "кол во",
        "кол-во",
        "объем",
        "обьем",
        "qty"
    ],

    unit: [
        "ед изм",
        "ед. изм",
        "единица измерения",
        "единица",
        "ед"
    ],

    price: [
        "цена",
        "цена за единицу",
        "цена за ед",
        "стоимость единицы",
        "price"
    ],

    total: [
        "полная стоимость",
        "общая стоимость",
        "стоимость всего",
        "итоговая сумма",
        "сумма",
        "всего",
        "итого",
        "стоимость",
        "total"
    ]

};


/* ============================================================
   ПОИСК КОЛОНОК
============================================================ */

function normalizeColumnHeader(value) {

    return String(value ?? "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/№/g, " номер ")
        .replace(/[^a-zа-я0-9]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

}


function getHeaderMatchScore(header, alias) {

    if (!header || !alias) return 0;

    if (header === alias) {
        return 100 + alias.length;
    }

    if (header.startsWith(alias + " ")) {
        return 70 + alias.length;
    }

    const paddedHeader = " " + header + " ";
    const paddedAlias = " " + alias + " ";

    if (paddedHeader.includes(paddedAlias)) {
        return 50 + alias.length;
    }

    return 0;

}


function detectColumns(headers) {

    const normalizedHeaders =
        headers.map(normalizeColumnHeader);

    const candidates = [];

    for (const [field, aliases] of Object.entries(COLUMN_RULES)) {

        normalizedHeaders.forEach((header, columnIndex) => {

            aliases.forEach((rawAlias) => {

                const alias = normalizeColumnHeader(rawAlias);
                const score = getHeaderMatchScore(header, alias);

                if (score > 0) {
                    candidates.push({
                        field,
                        columnIndex,
                        score
                    });
                }

            });

        });

    }

    candidates.sort((a, b) => b.score - a.score);

    const indexes = Object.fromEntries(
        Object.keys(COLUMN_RULES).map((field) => [field, -1])
    );

    const usedColumns = new Set();
    const assignedFields = new Set();

    for (const candidate of candidates) {

        if (assignedFields.has(candidate.field)) continue;
        if (usedColumns.has(candidate.columnIndex)) continue;

        indexes[candidate.field] = candidate.columnIndex;
        assignedFields.add(candidate.field);
        usedColumns.add(candidate.columnIndex);

    }

    const errors = [];
    const warnings = [];

    if (indexes.name === -1) {
        errors.push(
            "Не найдена обязательная колонка «Наименование»."
        );
    }

    const hasTotal = indexes.total !== -1;
    const canCalculateTotal =
        indexes.quantity !== -1 && indexes.price !== -1;

    if (!hasTotal && !canCalculateTotal) {
        errors.push(
            "Не найдена полная стоимость и недостаточно данных для её расчёта."
        );
    }

    if (indexes.workType === -1) {
        warnings.push(
            "Вид работ будет взят из обязательного поля над загрузчиком."
        );
    }

    if (indexes.unit === -1) {
        warnings.push("Не найдена единица измерения.");
    }

    return {
        indexes,
        errors,
        warnings,
        score: candidates.reduce((sum, item) => sum + item.score, 0)
    };

}


/* ============================================================
   ПОИСК СТРОКИ ЗАГОЛОВКОВ
============================================================ */

function detectHeaderRow(data) {

    let bestRow = -1;
    let bestScore = -1;
    let bestDetection = null;

    const limit =
        Math.min(data.length, 25);

    for (
        let rowIndex = 0;
        rowIndex < limit;
        rowIndex++
    ) {

        const row =
            data[rowIndex] || [];

        const detection = detectColumns(row);

        const recognizedCount = Object.values(detection.indexes)
            .filter((index) => index !== -1)
            .length;

        const score =
            recognizedCount * 1000 + detection.score;

        if (score > bestScore) {

            bestScore = score;
            bestRow = rowIndex;
            bestDetection = detection;

        }

    }

    return {
        rowIndex: bestRow,
        detection: bestDetection
    };
}


/* ============================================================
   СОЗДАНИЕ ОДНОЙ СТРОКИ СМЕТЫ
============================================================ */

function normalizePositionName(value) {

    return String(value ?? "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

}


function mergeReviewReasons(...reasons) {

    return [
        ...new Set(
            reasons
                .flatMap((reason) => String(reason || "").split(";"))
                .map((reason) => reason.trim())
                .filter(Boolean)
        )
    ].join("; ");

}

function addEstimateRow({
    workType,
    name,
    quantity,
    unit,
    price,
    total,
    source,
    date,
    category,
    needsReview = false,
    reviewReason = ""
}) {

    name =
        normalizePositionName(name);

    if (!name) return;


    /*
        Пропускаем стандартные итоговые строки,
        чтобы не посчитать общую сумму дважды.
    */

    if (
        /^(?:итого|всего|общая стоимость)(?:\s|$|[:\-])|^(?:subtotal|total)\b/i
            .test(name)
    ) {
        return;
    }


    quantity =
        parseNumber(quantity);

    price =
        parseNumber(price);

    total =
        parseNumber(total);


    /*
        Если итог не указан,
        но есть количество и цена,
        рассчитываем его автоматически.
    */

    if (
        total === null &&
        quantity !== null &&
        price !== null
    ) {

        total =
            quantity * price;

    }


    /*
        Если цена отсутствует,
        но известны итог и количество,
        рассчитываем цену.
    */

    if (
        price === null &&
        total !== null &&
        quantity !== null &&
        quantity !== 0
    ) {

        price =
            total / quantity;

    }


    const reviewReasons = [];

    if (reviewReason) {
        reviewReasons.push(reviewReason);
    }

    if (!String(unit ?? "").trim()) {
        reviewReasons.push("Не распознана единица измерения");
    }

    if (
        quantity !== null &&
        price !== null &&
        total !== null
    ) {

        const calculatedTotal = quantity * price;
        const tolerance = Math.max(
            0.05,
            Math.abs(calculatedTotal) * 0.01
        );

        if (Math.abs(calculatedTotal - total) > tolerance) {
            reviewReasons.push(
                "Количество × цена не совпадает с полной стоимостью"
            );
        }

    }


    const newRow = {

        id: nextId++,

        date:
            toISODate(date) ||
            estimateDate.value ||
            todayISO(),

        category:
            String(category || defaultCategory.value || "Прочее").trim(),

        workType:
            String(workType || "Не указано").trim(),

        name,

        quantity,

        unit:
            String(unit ?? "").trim(),

        price,

        total,

        source:
            source || "",

        needsReview:
            Boolean(needsReview || reviewReasons.length),

        reviewReason:
            mergeReviewReasons(...reviewReasons)

    };


    /*
        Повторный анализ того же файла не должен удваивать бюджет.
        Для импортированных строк источник содержит файл, лист и номер строки.
        Ручные позиции намеренно не дедуплицируются.
    */

    const isDuplicate =
        newRow.source &&
        newRow.source !== "Вручную" &&
        estimateRows.some((row) =>
            row.source === newRow.source &&
            row.workType === newRow.workType &&
            row.name === newRow.name &&
            row.quantity === newRow.quantity &&
            row.unit === newRow.unit &&
            row.price === newRow.price &&
            row.total === newRow.total
        );

    if (isDuplicate) {
        nextId--;
        return estimateRows.find((row) =>
            row.source === newRow.source &&
            row.workType === newRow.workType &&
            row.name === newRow.name
        ) || null;
    }

    estimateRows.push(newRow);
    return newRow;

}


/* ============================================================
   АНАЛИЗ EXCEL / CSV
============================================================ */

async function analyzeExcel(file, defaultWorkType) {

    const buffer =
        await file.arrayBuffer();

    const workbook =
        XLSX.read(buffer, {
            type: "array",
            cellDates: true
        });

    let processedSheets = 0;
    let bestDeclaredTotal = null;


    for (const sheetName of workbook.SheetNames) {

        const sheet =
            workbook.Sheets[sheetName];

        const data =
            XLSX.utils.sheet_to_json(
                sheet,
                {
                    header: 1,
                    defval: "",
                    raw: true
                }
            );

        if (!data.length) continue;

        const genericTotal = findDeclaredTotalInRows(data);

        if (
            genericTotal &&
            (!bestDeclaredTotal || genericTotal.score >= bestDeclaredTotal.score)
        ) {
            bestDeclaredTotal = genericTotal;
        }


        const headerResult = detectHeaderRow(data);

        if (
            !headerResult.detection ||
            headerResult.detection.errors.length
        ) {
            console.warn(
                `Лист «${sheetName}» пропущен: не распознана структура сметы.`,
                headerResult.detection?.errors || []
            );
            continue;
        }

        const headerRowIndex = headerResult.rowIndex;
        const indexes = headerResult.detection.indexes;

        const columnTotal = findDeclaredTotalInRows(
            data,
            indexes.total
        );

        if (
            columnTotal &&
            (!bestDeclaredTotal || columnTotal.score >= bestDeclaredTotal.score)
        ) {
            bestDeclaredTotal = columnTotal;
        }

        if (headerResult.detection.warnings.length) {
            console.warn(
                `Предупреждения для листа «${sheetName}»:`,
                headerResult.detection.warnings
            );
        }

        processedSheets++;


        let pendingRow = null;

        const flushPendingRow = () => {

            if (!pendingRow) return;

            const sourceRange =
                pendingRow.startRow === pendingRow.endRow
                    ? `строка ${pendingRow.startRow}`
                    : `строки ${pendingRow.startRow}–${pendingRow.endRow}`;

            addEstimateRow({
                ...pendingRow.data,
                name: pendingRow.name,
                source: `${file.name} / ${sheetName} / ${sourceRange}`,
                needsReview: pendingRow.needsReview,
                reviewReason: pendingRow.reviewReason
            });

            pendingRow = null;

        };


        for (
            let i = headerRowIndex + 1;
            i < data.length;
            i++
        ) {

            const row = data[i];
            if (!row) continue;

            const name = normalizePositionName(row[indexes.name]);
            if (!name) continue;

            const quantityValue =
                indexes.quantity !== -1 ? row[indexes.quantity] : null;
            const priceValue =
                indexes.price !== -1 ? row[indexes.price] : null;
            const totalValue =
                indexes.total !== -1 ? row[indexes.total] : null;

            const hasNumericData =
                parseNumber(quantityValue) !== null ||
                parseNumber(priceValue) !== null ||
                parseNumber(totalValue) !== null;

            const positionNumber =
                indexes.positionNumber !== -1
                    ? normalizePositionName(row[indexes.positionNumber])
                    : "";

            const nonEmptyCells = row.filter(
                (cell) => normalizePositionName(cell) !== ""
            ).length;

            const looksLikeSection =
                /^(?:раздел|группа|категория)\s*[:\-]/i.test(name) ||
                (/^[А-ЯЁ\s]+$/.test(name) && name.length > 4);

            const isContinuation =
                Boolean(pendingRow) &&
                !hasNumericData &&
                !positionNumber &&
                !looksLikeSection &&
                nonEmptyCells <= 2;

            if (isContinuation) {

                if (!pendingRow.name.endsWith(name)) {
                    pendingRow.name = normalizePositionName(
                        pendingRow.name + " " + name
                    );
                }

                pendingRow.endRow = i + 1;
                pendingRow.needsReview = true;
                pendingRow.reviewReason = mergeReviewReasons(
                    pendingRow.reviewReason,
                    "Название объединено из нескольких строк Excel"
                );
                continue;

            }

            flushPendingRow();

            if (looksLikeSection) {
                continue;
            }

            if (!hasNumericData && !positionNumber) {
                continue;
            }

            const detectedWorkType =
                indexes.workType !== -1 ? row[indexes.workType] : "";
            const detectedCategory =
                indexes.category !== -1 ? row[indexes.category] : "";
            const detectedDate =
                indexes.date !== -1 ? row[indexes.date] : "";

            pendingRow = {
                name,
                startRow: i + 1,
                endRow: i + 1,
                needsReview: !hasNumericData,
                reviewReason:
                    hasNumericData
                        ? ""
                        : "У позиции не распознаны числовые значения",
                data: {
                    workType: detectedWorkType || defaultWorkType,
                    category: detectedCategory || defaultCategory.value,
                    date: detectedDate || estimateDate.value,
                    quantity: quantityValue,
                    unit: indexes.unit !== -1 ? row[indexes.unit] : "",
                    price: priceValue,
                    total: totalValue
                }
            };

        }

        flushPendingRow();

    }

    if (!processedSheets) {
        throw new Error(
            `В файле «${file.name}» не найден лист с распознаваемой сметой.`
        );
    }

    setDocumentCheck(file.name, bestDeclaredTotal);

}


/* ============================================================
   ИЗВЛЕЧЕНИЕ ТЕКСТА ИЗ PDF
============================================================ */

async function extractPdfDocument(file) {

    const buffer =
        await file.arrayBuffer();

    const pdf =
        await pdfjsLib
            .getDocument({
                data: buffer
            })
            .promise;

    let result = "";
    let globalLineNumber = 1;
    const pages = [];


    for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
    ) {

        const page =
            await pdf.getPage(pageNumber);

        const content =
            await page.getTextContent();

        const viewport = page.getViewport({ scale: 1 });


        /*
            Группируем элементы PDF
            примерно по горизонтальным строкам.
        */

        const rows = [];


        content.items.forEach(item => {

            const text =
                String(item.str || "").trim();

            if (!text) return;


            const x =
                item.transform[4];

            const y =
                Math.round(item.transform[5]);


            let row =
                rows.find(r =>
                    Math.abs(r.y - y) <= 2
                );


            if (!row) {

                row = {
                    y,
                    items: []
                };

                rows.push(row);

            }


            row.items.push({
                x,
                text,
                width: Number(item.width) || 0,
                height: Number(item.height) || 0
            });

        });


        rows.sort(
            (a, b) =>
                b.y - a.y
        );


        for (const row of rows) {

            row.items.sort(
                (a, b) =>
                    a.x - b.x
            );

            row.pageNumber = pageNumber;
            row.lineNumber = globalLineNumber++;
            row.text = row.items
                .map(item => item.text)
                .join("\t");

            result += row.text + "\n";

        }


        pages.push({
            pageNumber,
            height: viewport.height,
            rows
        });

        result += "\n";

    }


    return {
        text: result,
        pages
    };

}


function isPurePdfNumber(value) {

    return /^[+-]?\d[\d\s]*(?:[.,]\d+)?$/.test(
        String(value || "").trim()
    );

}


function isPdfHeaderOrFooter(row, pageHeight) {

    const text = normalizePositionName(row.text).toLowerCase();

    if (!text) return true;

    if (row.y < 24 || row.y > pageHeight - 24) {
        return true;
    }

    return (
        /наименование.*(?:количество|кол-во|цена|стоимость)/i.test(text) ||
        /^(?:страница|лист)\s+\d+/i.test(text) ||
        /^(?:итого|всего)(?:\s|$|[:\-])/i.test(text)
    );

}


function readStructuredPdfStart(row) {

    const items = row.items.slice().sort((a, b) => a.x - b.x);
    if (!items.length) return null;

    const firstText = normalizePositionName(items[0].text);
    const combinedFirst = firstText.match(/^(\d+)[.)]?\s+(.+)$/);
    const standaloneFirst = firstText.match(/^(\d+)[.)]?$/);

    if (!combinedFirst && !standaloneFirst) {
        return null;
    }

    const positionNumber = combinedFirst
        ? combinedFirst[1]
        : standaloneFirst[1];

    const inlineName = combinedFirst ? combinedFirst[2] : "";

    const numericItems = [];

    items.forEach((item, index) => {

        if (index === 0 || !isPurePdfNumber(item.text)) return;

        const previous = numericItems[numericItems.length - 1];
        const previousEndX = previous
            ? previous.x + previous.width
            : Number.NEGATIVE_INFINITY;
        const gap = item.x - previousEndX;

        /* PDF.js иногда делит сумму «5 128,00» на два объекта. */
        if (
            previous &&
            previous.endIndex === index - 1 &&
            gap >= -2 &&
            gap <= 18
        ) {

            previous.text += " " + item.text;
            previous.endIndex = index;
            previous.width = Math.max(
                previous.width,
                item.x + item.width - previous.x
            );
            return;

        }

        numericItems.push({
            text: item.text,
            x: item.x,
            width: item.width,
            startIndex: index,
            endIndex: index
        });

    });

    if (numericItems.length < 3) {
        return {
            positionNumber,
            name: normalizePositionName(
                [inlineName, ...items.slice(1).map((item) => item.text)].join(" ")
            ),
            quantity: null,
            unit: "",
            price: null,
            total: null,
            nameStartX: items[1]?.x ?? items[0].x + 20,
            quantityX: Number.POSITIVE_INFINITY,
            incomplete: true
        };
    }

    const quantityCell = numericItems[numericItems.length - 3];
    const priceCell = numericItems[numericItems.length - 2];
    const totalCell = numericItems[numericItems.length - 1];

    const nameItems = items.slice(1, quantityCell.startIndex);
    const unitItems = items.slice(
        quantityCell.endIndex + 1,
        priceCell.startIndex
    );

    const name = normalizePositionName(
        [inlineName, ...nameItems.map((item) => item.text)].join(" ")
    );

    const unit = normalizePositionName(
        unitItems
            .map((item) => item.text)
            .filter((text) => !isPurePdfNumber(text))
            .join(" ")
    );

    return {
        positionNumber,
        name,
        quantity: parseNumber(quantityCell.text),
        unit,
        price: parseNumber(priceCell.text),
        total: parseNumber(totalCell.text),
        nameStartX: nameItems[0]?.x ?? items[1]?.x ?? items[0].x + 20,
        quantityX: quantityCell.x,
        incomplete: false
    };

}


function parseStructuredPdfRows(
    pages,
    defaultWorkType,
    source
) {

    let current = null;
    let logicalRows = 0;
    let currentWorkType = defaultWorkType;

    const flushCurrent = () => {

        if (!current || !current.name) {
            current = null;
            return;
        }

        const sourceRange =
            current.startLine === current.endLine
                ? `строка ${current.startLine}`
                : `строки ${current.startLine}–${current.endLine}`;

        addEstimateRow({
            workType: current.workType,
            category: defaultCategory.value,
            date: estimateDate.value,
            name: current.name,
            quantity: current.quantity,
            unit: current.unit,
            price: current.price,
            total: current.total,
            source: `${source} / PDF / ${sourceRange}`,
            needsReview: current.incomplete,
            reviewReason: current.incomplete
                ? "В PDF распознана позиция, но не все числовые колонки"
                : ""
        });

        logicalRows++;
        current = null;

    };


    for (const page of pages) {

        for (const row of page.rows) {

            const sectionMatch = normalizePositionName(row.text).match(
                /^(?:раздел|вид работ|категория)\s*[:\-]\s*(.+)$/i
            );

            if (sectionMatch) {
                flushCurrent();
                currentWorkType = sectionMatch[1].trim();
                continue;
            }

            if (isPdfHeaderOrFooter(row, page.height)) {
                continue;
            }

            const start = readStructuredPdfStart(row);

            if (start) {

                flushCurrent();

                current = {
                    ...start,
                    workType: currentWorkType,
                    startLine: row.lineNumber,
                    endLine: row.lineNumber
                };

                continue;

            }

            if (!current) continue;

            const continuationText = normalizePositionName(
                row.items
                    .filter((item) =>
                        item.x >= current.nameStartX - 15 &&
                        item.x < current.quantityX - 8
                    )
                    .map((item) => item.text)
                    .join(" ")
            );

            if (!continuationText) continue;

            if (!current.name.endsWith(continuationText)) {
                current.name = normalizePositionName(
                    current.name + " " + continuationText
                );
            }

            current.endLine = row.lineNumber;

        }

    }

    flushCurrent();
    return logicalRows;

}


/* ============================================================
   ПРИБЛИЗИТЕЛЬНЫЙ ПОСТРОЧНЫЙ РАЗБОР PDF
============================================================ */

function parsePdfRows(
    text,
    defaultWorkType,
    source
) {

    const lines = text.split(/\r?\n/);
    let currentWorkType = defaultWorkType;
    let current = null;
    let logicalRows = 0;

    const flushCurrent = () => {

        if (!current || !current.name) {
            current = null;
            return;
        }

        const sourceRange =
            current.startLine === current.endLine
                ? `строка ${current.startLine}`
                : `строки ${current.startLine}–${current.endLine}`;

        addEstimateRow({
            workType: current.workType,
            name: current.name,
            quantity: current.quantity,
            unit: current.unit,
            price: current.price,
            total: current.total,
            source: `${source} / PDF-текст / ${sourceRange}`,
            date: estimateDate.value,
            category: defaultCategory.value,
            needsReview: current.needsReview,
            reviewReason: current.reviewReason
        });

        logicalRows++;
        current = null;

    };


    lines.forEach((rawLine, lineIndex) => {

        const hasColumnSeparators = /\t/.test(rawLine);
        const line = normalizePositionName(rawLine);
        if (!line) return;

        const sectionMatch = line.match(
            /^(?:раздел|вид работ|категория)\s*[:\-]\s*(.+)$/i
        );

        if (sectionMatch) {
            flushCurrent();
            currentWorkType = sectionMatch[1].trim();
            return;
        }

        if (
            /наименование.*(?:количество|кол-во|цена|стоимость)/i.test(line) ||
            /^(?:страница|лист)\s+\d+/i.test(line) ||
            /^(?:итого|всего)(?:\s|$|[:\-])/i.test(line)
        ) {
            return;
        }

        const positionMatch = line.match(/^(\d+)[.)]?\s+(.+)$/);
        const matches = [
            ...line.matchAll(/[-+]?\d[\d\s]*(?:[.,]\d+)?/g)
        ];

        if (
            matches.length >= 3 &&
            (positionMatch || hasColumnSeparators)
        ) {

            flushCurrent();

            const quantityMatch = matches[matches.length - 3];
            const priceMatch = matches[matches.length - 2];
            const totalMatch = matches[matches.length - 1];

            let name = line
                .slice(0, quantityMatch.index)
                .replace(/^\d+[.)]?\s+/, "");

            const betweenQuantityAndPrice = line.slice(
                quantityMatch.index + quantityMatch[0].length,
                priceMatch.index
            );

            const unitMatch = betweenQuantityAndPrice.match(
                /\b(шт\.?|м²|м2|м³|м3|пог\.?\s*м|м\.?п\.?|м|кг|л|компл\.?|комплект|ед\.?|час|день|дн\.?)\b/i
            );

            current = {
                workType: currentWorkType,
                name: normalizePositionName(name),
                quantity: parseNumber(quantityMatch[0]),
                unit: unitMatch ? unitMatch[1] : "",
                price: parseNumber(priceMatch[0]),
                total: parseNumber(totalMatch[0]),
                startLine: lineIndex + 1,
                endLine: lineIndex + 1,
                needsReview: !positionMatch,
                reviewReason: !positionMatch
                    ? "Граница позиции определена без номера строки"
                    : ""
            };

            return;

        }

        if (positionMatch) {

            flushCurrent();

            current = {
                workType: currentWorkType,
                name: normalizePositionName(positionMatch[2]),
                quantity: null,
                unit: "",
                price: null,
                total: null,
                startLine: lineIndex + 1,
                endLine: lineIndex + 1,
                needsReview: true,
                reviewReason: "В позиции не распознаны числовые колонки"
            };

            return;

        }

        if (current) {

            if (!current.name.endsWith(line)) {
                current.name = normalizePositionName(
                    current.name + " " + line
                );
            }

            current.endLine = lineIndex + 1;
            current.needsReview = true;
            current.reviewReason = mergeReviewReasons(
                current.reviewReason,
                "Название объединено резервным текстовым анализатором"
            );

        }

    });

    flushCurrent();
    return logicalRows;

}


function removePdfRowsBySource(source) {

    const pdfPrefix = `${source} / PDF`;

    const removedRows = estimateRows.filter(
        (row) => String(row.source || "").startsWith(pdfPrefix)
    );

    estimateRows = estimateRows.filter(
        (row) => !String(row.source || "").startsWith(pdfPrefix)
    );

    return removedRows;

}


/* ============================================================
   КНОПКА "АНАЛИЗИРОВАТЬ"
============================================================ */

analyzeButton.addEventListener(
    "click",
    async () => {

        const defaultWorkType =
            workTypeInput.value.trim();

        if (!defaultWorkType) {

            alert(
                "Перед анализом необходимо указать вид работ."
            );

            return;

        }


        const files =
            [...fileInput.files];


        if (!files.length) {

            alert(
                "Выберите файл сметы."
            );

            return;

        }


        analyzeButton.disabled = true;

        showStatus(
            "Анализируем смету..."
        );


        try {

            for (const file of files) {

                const extension =
                    file.name
                        .split(".")
                        .pop()
                        .toLowerCase();


                if (
                    extension === "xlsx" ||
                    extension === "xls" ||
                    extension === "csv"
                ) {

                    await analyzeExcel(
                        file,
                        defaultWorkType
                    );

                    loadedFiles.add(
                        file.name
                    );

                }


                else if (
                    extension === "pdf"
                ) {

                    const extractedDocument =
                        await extractPdfDocument(file);

                    const declaredPdfTotal = findDeclaredTotalInRows(
                        extractedDocument.pages.flatMap((page) => page.rows)
                    );

                    currentPdfSource =
                        file.name;

                    pdfText.value =
                        extractedDocument.text;

                    pdfPanel
                        .classList
                        .remove("hidden");


                    /*
                        Сразу пробуем разобрать PDF автоматически.
                    */

                    const previousPdfRows = removePdfRowsBySource(file.name);

                    let parsedRows = parseStructuredPdfRows(
                        extractedDocument.pages,
                        defaultWorkType,
                        file.name
                    );

                    if (!parsedRows) {
                        parsedRows = parsePdfRows(
                            extractedDocument.text,
                            defaultWorkType,
                            file.name
                        );
                    }

                    setDocumentCheck(file.name, declaredPdfTotal);

                    if (!parsedRows) {
                        estimateRows.push(...previousPdfRows);
                        throw new Error(
                            `В PDF «${file.name}» не удалось распознать позиции сметы.`
                        );
                    }

                    loadedFiles.add(
                        file.name
                    );

                }

            }


            saveToLocalStorage();
            renderAll();


            const reviewCount = estimateRows.filter(
                (row) => row.needsReview
            ).length;

            const mismatchCount = documentChecks.filter((check) => {

                if (
                    check.documentTotal === null ||
                    check.documentTotal === undefined
                ) {
                    return false;
                }

                const recognized = getRecognizedTotalForSource(check.source);
                const tolerance = Math.max(
                    0.05,
                    Math.abs(check.documentTotal) * 0.001
                );

                return Math.abs(recognized - check.documentTotal) > tolerance;

            }).length;

            showStatus(
                mismatchCount
                    ? `Анализ завершён, но сумма не совпала в документах: ${mismatchCount}. Проверьте блок сверки.`
                    : (reviewCount
                        ? `Анализ завершён. Позиций для ручной проверки: ${reviewCount}. Они выделены жёлтым.`
                        : "Анализ завершён. Итоговые суммы совпадают или итог документа не найден.")
            );

        }

        catch (error) {

            console.error(error);

            showStatus(
                "Ошибка при чтении файла: " +
                error.message
            );

        }

        finally {

            updateAnalyzeButton();

        }

    }
);


/* ============================================================
   ПОВТОРНЫЙ РАЗБОР ТЕКСТА PDF
============================================================ */

document
    .getElementById("parsePdfButton")
    .addEventListener(
        "click",
        () => {

            const defaultWorkType =
                workTypeInput.value.trim();

            if (!defaultWorkType) {

                alert(
                    "Сначала укажите вид работ."
                );

                return;

            }


            const source = currentPdfSource || "PDF";

            const declaredPdfTotal = findDeclaredTotalInRows(
                pdfText.value
                    .split(/\r?\n/)
                    .map((line) => line.split(/\t+/))
            );

            const previousPdfRows = removePdfRowsBySource(source);

            const parsedRows = parsePdfRows(
                pdfText.value,
                defaultWorkType,
                source
            );

            if (!parsedRows) {
                estimateRows.push(...previousPdfRows);
            }
            else {
                setDocumentCheck(source, declaredPdfTotal);
            }

            showStatus(
                parsedRows
                    ? `Текст PDF разобран: позиций ${parsedRows}. Проверьте строки с жёлтой пометкой.`
                    : "В тексте PDF не удалось распознать позиции."
            );


            saveToLocalStorage();
            renderAll();

        }
    );


/* ============================================================
   ДОБАВЛЕНИЕ РУЧНОЙ СТРОКИ
============================================================ */

document
    .getElementById("manualRowButton")
    .addEventListener(
        "click",
        () => {

            const workType =
                workTypeInput.value.trim()
                ||
                "Не указано";


            addEstimateRow({

                workType,

                name:
                    "Новая позиция",

                quantity:
                    1,

                unit:
                    "шт.",

                price:
                    0,

                total:
                    0,

                source:
                    "Вручную",

                date:
                    estimateDate.value ||
                    todayISO(),

                category:
                    defaultCategory.value

            });


            saveToLocalStorage();
            renderAll();

        }
    );


/* ============================================================
   ДОБАВЛЕНИЕ ПРЕДОПЛАТЫ
============================================================ */

document
    .getElementById("addPrepayButton")
    .addEventListener(
        "click",
        () => {

            const amount =
                parseNumber(prepayAmount.value);

            if (amount === null || amount <= 0) {

                alert(
                    "Укажите сумму предоплаты больше нуля."
                );

                return;

            }


            prepayments.push({

                id: nextId++,

                date:
                    prepayDate.value ||
                    todayISO(),

                amount,

                counterparty:
                    prepayCounterparty.value.trim(),

                workType:
                    prepayWorkType.value.trim() ||
                    workTypeInput.value.trim(),

                comment:
                    prepayComment.value.trim()

            });


            prepayAmount.value = "";
            prepayComment.value = "";


            saveToLocalStorage();
            renderAll();

        }
    );


/* ============================================================
   ОТОБРАЖЕНИЕ ТАБЛИЦЫ СМЕТЫ
============================================================ */

function renderTable() {

    tableBody.innerHTML = "";


    const filterValue =
        workFilter.value;

    const categoryValue =
        categoryFilter.value;


    const filteredRows =
        estimateRows
            .filter(row =>
                (!filterValue || row.workType === filterValue) &&
                (!categoryValue || row.category === categoryValue)
            )
            .slice()
            .sort(
                (a, b) => {

                    const dateCompare =
                        String(a.date || "")
                            .localeCompare(
                                String(b.date || "")
                            );

                    if (dateCompare !== 0) {
                        return dateCompare;
                    }

                    return a.workType.localeCompare(
                        b.workType,
                        "ru"
                    );

                }
            );


    const categoryOptions = getAllCategories();


    for (const row of filteredRows) {

        const tr =
            document.createElement("tr");

        if (row.needsReview) {
            tr.classList.add("needs-review");
        }


        const categorySelect =
            categoryOptions
                .map((name) =>
                    `<option value="${escapeHtml(name)}"${
                        name === row.category ? " selected" : ""
                    }>${escapeHtml(name)}</option>`
                )
                .join("");


        tr.innerHTML = `

            <td>
                <input
                    type="date"
                    data-field="date"
                    data-id="${row.id}"
                    value="${escapeHtml(row.date || "")}"
                >
            </td>

            <td>
                <select
                    data-field="category"
                    data-id="${row.id}"
                >
                    ${categorySelect}
                </select>
            </td>

            <td
                contenteditable="true"
                data-field="workType"
                data-id="${row.id}"
            >${escapeHtml(row.workType)}</td>

            <td>
                <div
                    contenteditable="true"
                    data-field="name"
                    data-id="${row.id}"
                >${escapeHtml(row.name)}</div>
                ${row.needsReview ? `
                    <span
                        class="review-badge"
                        title="${escapeHtml(row.reviewReason || "Проверьте распознавание")}" 
                    >Проверьте распознавание</span>
                ` : ""}
            </td>

            <td
                class="number"
                contenteditable="true"
                data-field="quantity"
                data-id="${row.id}"
            >${formatNumber(row.quantity)}</td>

            <td
                contenteditable="true"
                data-field="unit"
                data-id="${row.id}"
            >${escapeHtml(row.unit)}</td>

            <td
                class="number"
                contenteditable="true"
                data-field="price"
                data-id="${row.id}"
            >${formatNumber(row.price)}</td>

            <td
                class="number"
                contenteditable="true"
                data-field="total"
                data-id="${row.id}"
            >${formatNumber(row.total)}</td>

            <td>
                ${escapeHtml(row.source)}
            </td>

            <td>
                <button
                    class="danger small-button"
                    onclick="deleteRow(${row.id})"
                >
                    удалить
                </button>
            </td>

        `;


        tableBody.appendChild(tr);

    }


    tableBody
        .querySelectorAll(
            '[contenteditable="true"]'
        )
        .forEach(cell => {

            cell.addEventListener(
                "blur",
                handleCellEdit
            );

        });

    tableBody
        .querySelectorAll("input, select")
        .forEach((control) => {

            control.addEventListener(
                "change",
                handleCellEdit
            );

        });

}


/* ============================================================
   ОТОБРАЖЕНИЕ ТАБЛИЦЫ ПРЕДОПЛАТ
============================================================ */

function renderPrepayments() {

    prepayTableBody.innerHTML = "";

    prepayEmptyHint.style.display =
        prepayments.length ? "none" : "block";


    const sorted =
        prepayments
            .slice()
            .sort(
                (a, b) =>
                    String(a.date || "")
                        .localeCompare(
                            String(b.date || "")
                        )
            );


    for (const item of sorted) {

        const tr =
            document.createElement("tr");

        tr.innerHTML = `

            <td>
                <input
                    type="date"
                    data-prepay-field="date"
                    data-id="${item.id}"
                    value="${escapeHtml(item.date || "")}"
                >
            </td>

            <td>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    data-prepay-field="amount"
                    data-id="${item.id}"
                    value="${item.amount ?? ""}"
                >
            </td>

            <td
                contenteditable="true"
                data-prepay-field="counterparty"
                data-id="${item.id}"
            >${escapeHtml(item.counterparty)}</td>

            <td
                contenteditable="true"
                data-prepay-field="workType"
                data-id="${item.id}"
            >${escapeHtml(item.workType)}</td>

            <td
                contenteditable="true"
                data-prepay-field="comment"
                data-id="${item.id}"
            >${escapeHtml(item.comment)}</td>

            <td>
                <button
                    class="danger small-button"
                    onclick="deletePrepayment(${item.id})"
                >
                    удалить
                </button>
            </td>

        `;

        prepayTableBody.appendChild(tr);

    }


    prepayTableBody
        .querySelectorAll('[contenteditable="true"]')
        .forEach((cell) => {
            cell.addEventListener("blur", handlePrepayEdit);
        });

    prepayTableBody
        .querySelectorAll("input")
        .forEach((control) => {
            control.addEventListener("change", handlePrepayEdit);
        });

}


/* ============================================================
   РЕДАКТИРОВАНИЕ ЯЧЕЕК СМЕТЫ
============================================================ */

function handleCellEdit(event) {

    const cell =
        event.target;

    const id =
        Number(
            cell.dataset.id
        );

    const field =
        cell.dataset.field;

    const row =
        estimateRows.find(
            row => row.id === id
        );

    if (!row) return;


    let value =
        cell.tagName === "INPUT" ||
        cell.tagName === "SELECT"
            ? cell.value
            : cell.innerText.trim();


    if (
        field === "quantity" ||
        field === "price" ||
        field === "total"
    ) {

        value =
            parseNumber(value);

    }


    row[field] =
        value;


    /*
        Если меняются количество или цена,
        пересчитываем полную стоимость.
    */

    if (
        field === "quantity" ||
        field === "price"
    ) {

        if (
            row.quantity !== null &&
            row.price !== null
        ) {

            row.total =
                row.quantity *
                row.price;

        }

    }


    saveToLocalStorage();
    renderAll();

}


/* ============================================================
   РЕДАКТИРОВАНИЕ ПРЕДОПЛАТ
============================================================ */

function handlePrepayEdit(event) {

    const cell = event.target;
    const id = Number(cell.dataset.id);
    const field = cell.dataset.prepayField;

    const item = prepayments.find(
        (row) => row.id === id
    );

    if (!item) return;


    let value =
        cell.tagName === "INPUT"
            ? cell.value
            : cell.innerText.trim();

    if (field === "amount") {
        value = parseNumber(value) || 0;
    }

    item[field] = value;


    saveToLocalStorage();
    renderAll();

}


/* ============================================================
   УДАЛЕНИЕ СТРОКИ
============================================================ */

function deleteRow(id) {

    estimateRows =
        estimateRows.filter(
            row =>
                row.id !== id
        );


    saveToLocalStorage();
    renderAll();

}


function deletePrepayment(id) {

    prepayments =
        prepayments.filter(
            (item) => item.id !== id
        );

    saveToLocalStorage();
    renderAll();

}


/* ============================================================
   СВОДНЫЕ ПОКАЗАТЕЛИ
============================================================ */

function getExpenseTotal() {

    return estimateRows.reduce(
        (sum, row) =>
            sum + (Number(row.total) || 0),
        0
    );

}


function getPrepaySum() {

    return prepayments.reduce(
        (sum, item) =>
            sum + (Number(item.amount) || 0),
        0
    );

}


function renderSummary() {

    rowsCount.textContent =
        estimateRows.length;


    const types =
        [
            ...new Set(
                estimateRows
                    .map(row =>
                        row.workType
                    )
                    .filter(Boolean)
            )
        ];


    workTypesCount.textContent =
        types.length;


    filesCount.textContent =
        loadedFiles.size;


    const expenses = getExpenseTotal();
    const prepaid = getPrepaySum();
    const balance = expenses - prepaid;


    grandTotal.textContent =
        formatMoney(expenses);

    prepayTotal.textContent =
        formatMoney(prepaid);

    prepayCountHint.textContent =
        prepayments.length
            ? "Платежей: " + prepayments.length
            : "";


    balanceTotal.textContent =
        formatMoney(balance);

    balanceTotal.className =
        "summary-value " +
        (balance > 0 ? "negative" : "positive");


    const percent =
        expenses > 0
            ? Math.min(100, Math.round((prepaid / expenses) * 100))
            : (prepaid > 0 ? 100 : 0);

    paidProgress.style.width = percent + "%";

    paidHint.textContent =
        expenses > 0
            ? "Оплачено предоплатами: " + percent + "%"
            : (prepaid > 0 ? "Есть предоплаты без сметы" : "");

}


/* ============================================================
   ИТОГИ ПО ВИДАМ РАБОТ И КАТЕГОРИЯМ
============================================================ */

function renderGroupedCards(target, groups, emptyText) {

    if (!Object.keys(groups).length) {

        target.innerHTML = emptyText;
        return;

    }

    target.innerHTML =
        Object.entries(groups)
            .sort(
                (a, b) =>
                    a[0].localeCompare(
                        b[0],
                        "ru"
                    )
            )
            .map(
                ([name, data]) => `

                    <div class="group-item">

                        <div class="group-name">
                            ${escapeHtml(name)}
                        </div>

                        <div>
                            Позиций:
                            ${data.rows}
                        </div>

                        <div>
                            <strong>
                                ${formatMoney(data.total)}
                            </strong>
                        </div>

                    </div>

                `
            )
            .join("");

}


function buildGroups(list, keyName) {

    /* Объект без прототипа безопасен для ключей вроде "__proto__". */
    const groups = Object.create(null);

    list.forEach((row) => {

        const key =
            row[keyName] ||
            "Не указано";

        if (!Object.hasOwn(groups, key)) {

            groups[key] = {
                rows: 0,
                total: 0
            };

        }

        groups[key].rows++;
        groups[key].total += Number(row.total) || 0;

    });

    return groups;

}


function renderGroupSummary() {

    renderGroupedCards(
        groupSummary,
        buildGroups(estimateRows, "workType"),
        "Пока данных нет."
    );

}


function renderCategorySummary() {

    renderGroupedCards(
        categorySummary,
        buildGroups(estimateRows, "category"),
        "Пока данных нет."
    );

}


/* ============================================================
   ГРАФИКИ
============================================================ */

function destroyChart(name) {

    if (charts[name]) {
        charts[name].destroy();
        charts[name] = null;
    }

}


function toggleChart(canvasId, emptyId, hasData) {

    document.getElementById(canvasId).style.display =
        hasData ? "block" : "none";

    document.getElementById(emptyId).classList.toggle(
        "hidden",
        hasData
    );

}


function renderCharts() {

    const expenses = getExpenseTotal();
    const prepaid = getPrepaySum();

    const categoryGroups = buildGroups(estimateRows, "category");
    const workTypeGroups = buildGroups(estimateRows, "workType");

    const categoryLabels = Object.keys(categoryGroups);
    const workTypeLabels = Object.keys(workTypeGroups);

    toggleChart(
        "chartCategory",
        "chartCategoryEmpty",
        categoryLabels.length > 0 && expenses > 0
    );

    toggleChart(
        "chartWorkType",
        "chartWorkTypeEmpty",
        workTypeLabels.length > 0 && expenses > 0
    );

    toggleChart(
        "chartBalance",
        "chartBalanceEmpty",
        expenses > 0 || prepaid > 0
    );


    destroyChart("category");
    destroyChart("workType");
    destroyChart("timeline");
    destroyChart("balance");


    if (categoryLabels.length && expenses > 0) {

        charts.category = new Chart(
            document.getElementById("chartCategory"),
            {
                type: "doughnut",
                data: {
                    labels: categoryLabels,
                    datasets: [{
                        data: categoryLabels.map(
                            (name) => categoryGroups[name].total
                        ),
                        backgroundColor: CHART_COLORS
                    }]
                },
                options: {
                    plugins: {
                        legend: {
                            position: "bottom"
                        }
                    }
                }
            }
        );

    }


    if (workTypeLabels.length && expenses > 0) {

        charts.workType = new Chart(
            document.getElementById("chartWorkType"),
            {
                type: "bar",
                data: {
                    labels: workTypeLabels,
                    datasets: [{
                        label: "Расходы",
                        data: workTypeLabels.map(
                            (name) => workTypeGroups[name].total
                        ),
                        /* У каждого вида работ свой цвет столбца */
                        backgroundColor: workTypeLabels.map(
                            (_name, index) =>
                                CHART_COLORS[index % CHART_COLORS.length]
                        )
                    }]
                },
                options: {
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            }
        );

    }


    const months = new Set();

    estimateRows.forEach((row) => {
        const key = monthKey(row.date);
        if (key) months.add(key);
    });

    prepayments.forEach((item) => {
        const key = monthKey(item.date);
        if (key) months.add(key);
    });

    const monthLabels = [...months].sort();

    toggleChart(
        "chartTimeline",
        "chartTimelineEmpty",
        monthLabels.length > 0
    );


    if (monthLabels.length) {

        const expenseByMonth = {};
        const prepayByMonth = {};

        monthLabels.forEach((key) => {
            expenseByMonth[key] = 0;
            prepayByMonth[key] = 0;
        });

        estimateRows.forEach((row) => {
            const key = monthKey(row.date);
            if (key) {
                expenseByMonth[key] += Number(row.total) || 0;
            }
        });

        prepayments.forEach((item) => {
            const key = monthKey(item.date);
            if (key) {
                prepayByMonth[key] += Number(item.amount) || 0;
            }
        });

        charts.timeline = new Chart(
            document.getElementById("chartTimeline"),
            {
                type: "line",
                data: {
                    labels: monthLabels.map(formatMonth),
                    datasets: [
                        {
                            label: "Расходы",
                            data: monthLabels.map(
                                (key) => expenseByMonth[key]
                            ),
                            borderColor: "#dc2626",
                            backgroundColor: "rgba(220, 38, 38, 0.12)",
                            fill: true,
                            tension: 0.25
                        },
                        {
                            label: "Предоплаты",
                            data: monthLabels.map(
                                (key) => prepayByMonth[key]
                            ),
                            borderColor: "#16a34a",
                            backgroundColor: "rgba(22, 163, 74, 0.12)",
                            fill: true,
                            tension: 0.25
                        }
                    ]
                },
                options: {
                    plugins: {
                        legend: {
                            position: "bottom"
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            }
        );

    }


    if (expenses > 0 || prepaid > 0) {

        charts.balance = new Chart(
            document.getElementById("chartBalance"),
            {
                type: "bar",
                data: {
                    labels: ["Сметы", "Предоплаты", "Остаток"],
                    datasets: [{
                        data: [
                            expenses,
                            prepaid,
                            Math.max(0, expenses - prepaid)
                        ],
                        backgroundColor: [
                            "#dc2626",
                            "#16a34a",
                            "#2563eb"
                        ]
                    }]
                },
                options: {
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            }
        );

    }

}


/* ============================================================
   ФИЛЬТР
============================================================ */

function renderFilter() {

    const currentWork = workFilter.value;
    const currentCategory = categoryFilter.value;


    const types =
        [
            ...new Set(
                estimateRows
                    .map(row =>
                        row.workType
                    )
                    .filter(Boolean)
            )
        ]
        .sort(
            (a, b) =>
                a.localeCompare(
                    b,
                    "ru"
                )
        );


    workFilter.innerHTML =
        '<option value="">Все виды работ</option>';


    types.forEach(type => {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            type;

        option.textContent =
            type;

        workFilter.appendChild(
            option
        );

    });


    if (types.includes(currentWork)) {
        workFilter.value = currentWork;
    }

    fillCategorySelect(
        categoryFilter,
        currentCategory,
        true
    );

    fillCategorySelect(
        defaultCategory,
        defaultCategory.value || "Работы",
        false
    );

}


function renderDocumentReconciliation() {

    const sources = [
        ...new Set([
            ...loadedFiles,
            ...documentChecks.map((item) => item.source)
        ])
    ];

    if (!sources.length) {
        documentReconciliation.textContent =
            "Загрузите смету, чтобы сравнить итог документа с распознанными позициями.";
        return;
    }

    documentReconciliation.innerHTML = sources
        .map((source) => {

            const check = documentChecks.find(
                (item) => item.source === source
            );

            const documentTotal = check?.documentTotal;
            const recognizedTotal = getRecognizedTotalForSource(source);

            if (documentTotal === null || documentTotal === undefined) {
                return `
                    <div class="reconciliation-item unavailable">
                        <div>
                            <div class="reconciliation-label">Документ</div>
                            <div class="reconciliation-value">${escapeHtml(source)}</div>
                        </div>
                        <div>
                            <div class="reconciliation-label">Итог документа</div>
                            <div class="reconciliation-value">Не найден</div>
                        </div>
                        <div>
                            <div class="reconciliation-label">Распознано</div>
                            <div class="reconciliation-value">${formatMoney(recognizedTotal)}</div>
                        </div>
                        <div>
                            <div class="reconciliation-label">Статус</div>
                            <div class="reconciliation-value">Сверка невозможна</div>
                        </div>
                    </div>
                `;
            }

            const difference = recognizedTotal - documentTotal;
            const tolerance = Math.max(0.05, Math.abs(documentTotal) * 0.001);
            const matches = Math.abs(difference) <= tolerance;

            return `
                <div class="reconciliation-item ${matches ? "match" : "mismatch"}">
                    <div>
                        <div class="reconciliation-label">Документ</div>
                        <div class="reconciliation-value">${escapeHtml(source)}</div>
                    </div>
                    <div>
                        <div class="reconciliation-label">Итог документа</div>
                        <div class="reconciliation-value">${formatMoney(documentTotal)}</div>
                    </div>
                    <div>
                        <div class="reconciliation-label">Распознано</div>
                        <div class="reconciliation-value">${formatMoney(recognizedTotal)}</div>
                    </div>
                    <div>
                        <div class="reconciliation-label">Разница</div>
                        <div class="reconciliation-value">
                            ${formatMoney(difference)} — ${matches ? "совпадает" : "не совпадает"}
                        </div>
                    </div>
                </div>
            `;

        })
        .join("");

}


workFilter.addEventListener("change", renderTable);
categoryFilter.addEventListener("change", renderTable);


/* ============================================================
   ОБНОВЛЕНИЕ ВСЕГО ИНТЕРФЕЙСА
============================================================ */

function renderAll() {

    renderFilter();
    renderTable();
    renderPrepayments();
    renderSummary();
    renderGroupSummary();
    renderCategorySummary();
    renderDocumentReconciliation();
    renderCharts();

}


/* ============================================================
   EXCEL-ЭКСПОРТ: РАСХОДЫ + ПРЕДОПЛАТЫ + СВОДКА
============================================================ */

document
    .getElementById("exportButton")
    .addEventListener(
        "click",
        () => {

            if (
                !estimateRows.length &&
                !prepayments.length
            ) {

                alert(
                    "Нет данных для выгрузки."
                );

                return;

            }


            const expenseSheet = estimateRows.map((row) => ({
                "Дата": row.date || "",
                "Категория": row.category || "",
                "Вид работ": row.workType || "",
                "Наименование": row.name || "",
                "Количество": row.quantity ?? "",
                "Единица измерения": row.unit || "",
                "Цена": row.price ?? "",
                "Полная стоимость": row.total ?? "",
                "Источник": row.source || "",
                "Требует проверки": row.needsReview ? "Да" : "Нет",
                "Причина проверки": row.reviewReason || ""
            }));


            const prepaySheet = prepayments.map((item) => ({
                "Дата": item.date || "",
                "Сумма": item.amount ?? "",
                "Контрагент": item.counterparty || "",
                "Вид работ": item.workType || "",
                "Комментарий": item.comment || ""
            }));


            const expenses = getExpenseTotal();
            const prepaid = getPrepaySum();

            const summarySheet = [
                {
                    "Показатель": "Расходы по сметам",
                    "Сумма": expenses
                },
                {
                    "Показатель": "Предоплаты",
                    "Сумма": prepaid
                },
                {
                    "Показатель": "Остаток к оплате",
                    "Сумма": expenses - prepaid
                }
            ];


            const reconciliationSheet = [
                ...new Set([
                    ...loadedFiles,
                    ...documentChecks.map((item) => item.source)
                ])
            ].map((source) => {

                const check = documentChecks.find(
                    (item) => item.source === source
                );
                const documentTotal = check?.documentTotal ?? null;
                const recognizedTotal = getRecognizedTotalForSource(source);
                const difference = documentTotal === null
                    ? null
                    : recognizedTotal - documentTotal;
                const tolerance = documentTotal === null
                    ? null
                    : Math.max(0.05, Math.abs(documentTotal) * 0.001);

                return {
                    "Документ": source,
                    "Итог документа": documentTotal ?? "Не найден",
                    "Сумма распознанных позиций": recognizedTotal,
                    "Разница": difference ?? "",
                    "Статус": documentTotal === null
                        ? "Сверка невозможна"
                        : (Math.abs(difference) <= tolerance
                            ? "Совпадает"
                            : "Не совпадает")
                };

            });


            const workbook = XLSX.utils.book_new();

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet(expenseSheet),
                "Расходы"
            );

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet(prepaySheet),
                "Предоплаты"
            );

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet(summarySheet),
                "Сводка"
            );

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet(reconciliationSheet),
                "Сверка документов"
            );


            XLSX.writeFile(
                workbook,
                "budget_remonta.xlsx"
            );

        }
    );


/* ============================================================
   ОЧИСТКА
============================================================ */

document
    .getElementById("clearButton")
    .addEventListener(
        "click",
        () => {

            if (
                !confirm(
                    "Удалить все загруженные данные?"
                )
            ) {
                return;
            }


            estimateRows = [];
            prepayments = [];
            loadedFiles.clear();
            documentChecks = [];

            pdfText.value = "";

            pdfPanel
                .classList
                .add("hidden");


            localStorage.removeItem(
                "renovationBudgetData"
            );


            renderAll();

        }
    );


/* ============================================================
   СОХРАНЕНИЕ ДАННЫХ В БРАУЗЕРЕ
============================================================ */

function saveToLocalStorage() {

    const data = {

        rows:
            estimateRows,

        prepayments,

        files:
            [...loadedFiles],

        documentChecks,

        nextId

    };


    try {

        localStorage.setItem(
            "renovationBudgetData",
            JSON.stringify(data)
        );

        return true;

    }

    catch (error) {

        console.warn("Не удалось сохранить данные в браузере.", error);

        showStatus(
            "Данные отображаются, но браузер не смог сохранить их локально. " +
            "Рекомендуется сразу выгрузить Excel-файл."
        );

        return false;

    }

}


/* ============================================================
   ВОССТАНОВЛЕНИЕ ДАННЫХ
============================================================ */

function normalizeSavedRows(rows) {

    return rows.map((row) => ({

        ...row,

        date:
            toISODate(row.date) || "",

        category:
            row.category || "Прочее",

        name:
            normalizePositionName(row.name),

        needsReview:
            Boolean(row.needsReview),

        reviewReason:
            String(row.reviewReason || "")

    }));

}


function loadFromLocalStorage() {

    const stored =
        localStorage.getItem(
            "renovationBudgetData"
        );


    if (!stored) return;


    try {

        const data =
            JSON.parse(stored);


        estimateRows =
            Array.isArray(data.rows)
                ? normalizeSavedRows(data.rows)
                : [];


        prepayments =
            Array.isArray(data.prepayments)
                ? data.prepayments
                : [];


        loadedFiles =
            new Set(
                Array.isArray(data.files)
                    ? data.files
                    : []
            );


        documentChecks = Array.isArray(data.documentChecks)
            ? data.documentChecks.map((item) => ({
                source: String(item.source || ""),
                documentTotal:
                    item.documentTotal === null || item.documentTotal === undefined
                        ? null
                        : parseNumber(item.documentTotal),
                totalLabel: String(item.totalLabel || "")
            })).filter((item) => item.source)
            : [];


        const allIds = [
            ...estimateRows.map((row) => row.id || 0),
            ...prepayments.map((item) => item.id || 0)
        ];

        nextId =
            data.nextId ||
            (
                allIds.length
                    ? Math.max(...allIds) + 1
                    : 1
            );

    }

    catch (error) {

        console.warn(
            "Не удалось восстановить данные.",
            error
        );

    }

}


/* ============================================================
   ЗАЩИТА ОТ HTML В ДАННЫХ
============================================================ */

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, '&#quot;')
        .replace(/'/g, "&#039;");

}


/* ============================================================
   ПЕРВЫЙ ЗАПУСК
============================================================ */

estimateDate.value = todayISO();
prepayDate.value = todayISO();

fillCategorySelect(defaultCategory, "Работы", false);

loadFromLocalStorage();
renderAll();
