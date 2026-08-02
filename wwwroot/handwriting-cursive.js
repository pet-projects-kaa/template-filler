"use strict";

(() => {
    const CATEGORY_ID = "cursive-notes";
    const existingCategory = categories.some(item => item.id === CATEGORY_ID);

    if (!existingCategory) {
        const insertAt = Math.max(0, categories.findIndex(item => item.id === "student"));
        categories.splice(insertAt, 0, {
            id: CATEGORY_ID,
            name: "Прописные конспекты",
            preview: "Тема лекции: основные понятия, определения и краткие выводы"
        });

        archetypes[CATEGORY_ID] = [
            profile("Ровные прописи", "Marck Script", 0.98, -0.04, 0.96, -0.55, 0.75, 0.60, 0.014, 0.88, 400, 24),
            profile("Мелкий связный", "Marck Script", 0.78, -0.08, 0.90, -1.05, 1.05, 0.85, 0.022, 0.84, 400, 34),
            profile("Конспект лекции", "Bad Script", 0.91, -0.10, 0.91, -0.85, 1.45, 1.10, 0.030, 0.82, 400, 48),
            profile("Быстрый курсив", "Bad Script", 0.88, -0.17, 0.84, -1.25, 2.45, 1.75, 0.046, 0.76, 400, 67),
            profile("Аккуратная тетрадь", "Shantell Sans", 0.89, -0.06, 0.92, -0.60, 0.95, 0.75, 0.020, 0.86, 400, 31)
        ];

        const knownIds = new Set(allProfiles.map(item => item.id));
        for (const item of buildProfiles()) {
            if (item.categoryId === CATEGORY_ID && !knownIds.has(item.id)) {
                item.wordMode = true;
                allProfiles.push(item);
            }
        }
    }

    const originalMeasureText = measureText;
    const originalDrawNaturalLine = drawNaturalLine;

    measureText = function measureCursiveText(context, text, selected, fontSize, userSpacing) {
        if (selected.categoryId !== CATEGORY_ID) {
            return originalMeasureText(context, text, selected, fontSize, userSpacing);
        }

        context.font = `${selected.weight || 400} ${fontSize}px "${selected.font}", cursive`;
        const shapedWidth = context.measureText(text).width * selected.compress;
        const extraSpacing = Math.max(0, text.length - 1) * (selected.spacing + userSpacing) * 0.22;
        return shapedWidth + extraSpacing;
    };

    drawNaturalLine = function drawCursiveLine(
        context,
        text,
        startX,
        baselineY,
        selected,
        ink,
        fontSize,
        userSpacing,
        strength,
        naturalness,
        random,
        scale
    ) {
        if (selected.categoryId !== CATEGORY_ID) {
            return originalDrawNaturalLine(
                context,
                text,
                startX,
                baselineY,
                selected,
                ink,
                fontSize,
                userSpacing,
                strength,
                naturalness,
                random,
                scale
            );
        }

        drawConnectedWords(
            context,
            text,
            startX,
            baselineY,
            selected,
            ink,
            fontSize,
            userSpacing,
            strength,
            naturalness,
            random,
            scale
        );
    };

    function drawConnectedWords(
        context,
        text,
        startX,
        baselineY,
        selected,
        ink,
        fontSize,
        userSpacing,
        strength,
        naturalness,
        random,
        scale
    ) {
        const tokens = text.match(/\S+|\s+/g) || [];
        const baseColor = hexToRgb(ink.color);
        const lineSlope = (random() - 0.5) * selected.angle * naturalness * 0.50;
        const lineWave = selected.lineWave * naturalness * scale;
        let cursor = startX + (random() - 0.5) * 5 * naturalness * scale;
        let wordIndex = 0;

        for (const token of tokens) {
            if (/^\s+$/.test(token)) {
                const spaceWidth = fontSize * (0.20 + random() * 0.08) * selected.compress;
                cursor += spaceWidth + Math.max(-1.2 * scale, userSpacing * 0.35);
                continue;
            }

            const localSize = fontSize * (1 + (random() - 0.5) * 0.035 * naturalness);
            const localCompress = clamp(
                selected.compress + (random() - 0.5) * 0.025 * naturalness,
                0.68,
                1.12
            );
            const localSlant = selected.slant + (random() - 0.5) * 0.016 * naturalness;
            const angle = lineSlope + (random() - 0.5) * selected.angle * naturalness * 0.35;
            const wave = Math.sin(wordIndex * 0.83 + random() * 0.6) * lineWave * 0.38;
            const dy = wave + (random() - 0.5) * selected.charJitter * naturalness * scale * 0.55;
            const alphaVariance = ink.alpha[0] + random() * (ink.alpha[1] - ink.alpha[0]);
            const weakWord = random() < ink.dropout * naturalness * 0.28;
            const mainAlpha = clamp(
                alphaVariance * selected.alpha * strength * (weakWord ? 0.58 : 1),
                0.12,
                1
            );
            const colorJitter = (random() - 0.5) * ink.jitter * 0.65;
            const localColor = rgbString(
                clamp(baseColor.r + colorJitter, 0, 255),
                clamp(baseColor.g + colorJitter, 0, 255),
                clamp(baseColor.b + colorJitter * 1.35, 0, 255)
            );

            context.save();
            context.translate(cursor, baselineY + dy);
            context.rotate(angle);
            context.transform(localCompress, 0, localSlant * naturalness, 1, 0, 0);
            context.font = `${selected.weight || 400} ${localSize}px "${selected.font}", cursive`;
            context.fillStyle = localColor;
            context.globalAlpha = mainAlpha;
            context.shadowColor = `rgba(${baseColor.r},${baseColor.g},${baseColor.b},${ink.shadow * strength * 0.72})`;
            context.shadowBlur = Math.max(0, 0.25 * scale);
            context.fillText(token, 0, 0);

            if (!weakWord && random() < 0.92) {
                context.globalAlpha = clamp(mainAlpha * ink.overlay * 0.72, 0.025, 0.24);
                context.fillText(
                    token,
                    (random() - 0.5) * 0.42 * scale,
                    (random() - 0.5) * 0.34 * scale
                );
            }

            const wordWidth = context.measureText(token).width;
            context.restore();

            const joinedSpacing = selected.spacing * scale * 0.18 + userSpacing * 0.22;
            const advanceNoise = (random() - 0.5) * 1.15 * naturalness * scale;
            cursor += wordWidth * localCompress + joinedSpacing + advanceNoise;
            wordIndex += 1;
        }

        context.globalAlpha = 1;
        context.shadowBlur = 0;
    }

    populateCategories();
    populateStyles();
})();
