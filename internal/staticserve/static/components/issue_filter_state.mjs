const DEFAULT_SEVERITIES = ['critical', 'error', 'warning', 'info'];
const SELECTION_FIELDS = Object.freeze({
    severity: 'severities',
    confidence: 'confidences',
    type: 'types',
    category: 'categories',
    subcategory: 'subcategories',
});
const FACET_FIELDS = Object.freeze(Object.keys(SELECTION_FIELDS));
const CONFIDENCE_ORDER = ['high', 'medium', 'low'];

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizeFacetValue(value) {
    return normalizeText(value).toLowerCase();
}

function normalizeSeverity(value) {
    const severity = normalizeFacetValue(value);
    if (DEFAULT_SEVERITIES.includes(severity)) {
        return severity;
    }
    return 'info';
}

function normalizeCommentShape(comment) {
    return {
        severity: normalizeSeverity(comment?.Severity ?? comment?.severity),
        confidence: normalizeText(comment?.Confidence ?? comment?.confidence),
        type: normalizeText(comment?.Type ?? comment?.type),
        category: normalizeText(comment?.Category ?? comment?.category),
        subcategory: normalizeText(comment?.Subcategory ?? comment?.subcategory),
        content: normalizeText(comment?.Content ?? comment?.content),
        line: comment?.Line ?? comment?.line ?? '',
    };
}

function cloneSelectionSet(value) {
    if (!(value instanceof Set)) {
        return null;
    }
    return new Set(value);
}

function normalizeSelectionSet(values, normalizer = normalizeFacetValue) {
    if (values == null) {
        return null;
    }
    const normalized = new Set();
    values.forEach((value) => {
        const next = normalizer(value);
        if (next) {
            normalized.add(next);
        }
    });
    return normalized;
}

function selectionMatches(selectionSet, normalizedValue) {
    if (!(selectionSet instanceof Set) || selectionSet.size === 0) {
        return true;
    }
    return selectionSet.has(normalizedValue);
}

function formatSeverityLabel(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function sortValues(values, preferredOrder = []) {
    return [...values].sort((left, right) => {
        const leftIndex = preferredOrder.indexOf(left);
        const rightIndex = preferredOrder.indexOf(right);
        if (leftIndex !== -1 || rightIndex !== -1) {
            if (leftIndex === -1) return 1;
            if (rightIndex === -1) return -1;
            return leftIndex - rightIndex;
        }
        return left.localeCompare(right);
    });
}

function getSelectionFieldName(field) {
    return SELECTION_FIELDS[field] || '';
}

function getNormalizedFacetValue(shape, field) {
    if (field === 'severity') {
        return shape.severity;
    }
    return normalizeFacetValue(shape[field]);
}

function matchesIssueFiltersExcludingField(comment, filters, excludedField) {
    const normalizedFilters = normalizeIssueFilters(filters);
    const shape = normalizeCommentShape(comment);

    return FACET_FIELDS.every((field) => {
        if (field === excludedField) {
            return true;
        }
        const selectionField = getSelectionFieldName(field);
        const selectionSet = normalizedFilters[selectionField];
        return selectionMatches(selectionSet, getNormalizedFacetValue(shape, field));
    });
}

function matchesIssueFiltersExcludingFields(comment, filters, excludedFields) {
    const normalizedFilters = normalizeIssueFilters(filters);
    const excluded = new Set(excludedFields || []);
    const shape = normalizeCommentShape(comment);

    return FACET_FIELDS.every((field) => {
        if (excluded.has(field)) {
            return true;
        }
        const selectionField = getSelectionFieldName(field);
        const selectionSet = normalizedFilters[selectionField];
        return selectionMatches(selectionSet, getNormalizedFacetValue(shape, field));
    });
}

function iterateIssueComments(files, visitor) {
    (files || []).forEach((file) => {
        const filePath = file?.FilePath || file?.file_path || file?.filePath || '';
        (file?.Hunks || []).forEach((hunk) => {
            (hunk?.Lines || []).forEach((line) => {
                if (!line?.IsComment || !Array.isArray(line?.Comments)) {
                    return;
                }
                line.Comments.forEach((comment) => visitor({ filePath, comment }));
            });
        });
    });
}

export function createDefaultIssueFilters() {
    return {
        severities: new Set(DEFAULT_SEVERITIES),
        confidences: null,
        types: null,
        categories: null,
        subcategories: null,
    };
}

export function cloneIssueFilters(filters) {
    const source = filters || createDefaultIssueFilters();
    return {
        severities: cloneSelectionSet(source.severities) || new Set(DEFAULT_SEVERITIES),
        confidences: cloneSelectionSet(source.confidences),
        types: cloneSelectionSet(source.types),
        categories: cloneSelectionSet(source.categories),
        subcategories: cloneSelectionSet(source.subcategories),
    };
}

export function normalizeIssueFilters(filters) {
    const source = filters || {};
    return {
        severities: normalizeSelectionSet(source.severities || DEFAULT_SEVERITIES, normalizeSeverity) || new Set(DEFAULT_SEVERITIES),
        confidences: normalizeSelectionSet(source.confidences),
        types: normalizeSelectionSet(source.types),
        categories: normalizeSelectionSet(source.categories),
        subcategories: normalizeSelectionSet(source.subcategories),
    };
}

export function isDefaultIssueSeveritySelection(selection) {
    if (!(selection instanceof Set) || selection.size !== DEFAULT_SEVERITIES.length) {
        return false;
    }
    return DEFAULT_SEVERITIES.every((value) => selection.has(value));
}

export function hasActiveIssueFilters(filters) {
    const normalized = normalizeIssueFilters(filters);
    if (!isDefaultIssueSeveritySelection(normalized.severities)) {
        return true;
    }
    return Boolean(normalized.confidences || normalized.types || normalized.categories || normalized.subcategories);
}

export function toggleIssueFilterValue(filters, field, rawValue, options = {}) {
    const selectionField = getSelectionFieldName(field);
    if (!selectionField) {
        return normalizeIssueFilters(filters);
    }

    const next = cloneIssueFilters(filters);
    const current = cloneSelectionSet(next[selectionField]);
    const value = field === 'severity' ? normalizeSeverity(rawValue) : normalizeFacetValue(rawValue);
    const allValues = Array.isArray(options.allValues)
        ? options.allValues
            .map((entry) => field === 'severity' ? normalizeSeverity(entry) : normalizeFacetValue(entry))
            .filter(Boolean)
        : [];
    const childValues = Array.isArray(options.childValues)
        ? options.childValues.map((entry) => normalizeFacetValue(entry)).filter(Boolean)
        : [];
    const allChildValues = Array.isArray(options.allChildValues)
        ? options.allChildValues.map((entry) => normalizeFacetValue(entry)).filter(Boolean)
        : [];
    if (!value) {
        return next;
    }

    const syncChildSelections = (enabled) => {
        if (field !== 'category' || childValues.length === 0) {
            return;
        }

        const currentChildren = cloneSelectionSet(next.subcategories);
        if (enabled) {
            if (!(currentChildren instanceof Set)) {
                return;
            }
            childValues.forEach((childValue) => currentChildren.add(childValue));
            next.subcategories = allChildValues.length > 0 && currentChildren.size === new Set(allChildValues).size
                ? null
                : currentChildren;
            return;
        }

        if (!(currentChildren instanceof Set)) {
            const nextChildren = new Set(allChildValues);
            childValues.forEach((childValue) => nextChildren.delete(childValue));
            next.subcategories = nextChildren;
            return;
        }

        childValues.forEach((childValue) => currentChildren.delete(childValue));
        next.subcategories = currentChildren;
    };

    if (!(current instanceof Set)) {
        if (allValues.length > 0) {
            const nextSelection = new Set(allValues);
            nextSelection.delete(value);
            next[selectionField] = nextSelection;
            syncChildSelections(false);
            return next;
        }

        next[selectionField] = new Set();
        return next;
    }

    if (current.has(value)) {
        current.delete(value);
        syncChildSelections(false);
    } else {
        current.add(value);
        syncChildSelections(true);
    }

    if (allValues.length > 0 && current.size === allValues.length) {
        next[selectionField] = null;
        return next;
    }

    next[selectionField] = current.size > 0 ? current : null;
    return next;
}

export function resetIssueFilters() {
    return createDefaultIssueFilters();
}

export function getCommentFilterValue(comment, field) {
    const shape = normalizeCommentShape(comment);
    return shape[field] || '';
}

export function matchesIssueFilters(comment, filters) {
    const normalized = normalizeIssueFilters(filters);
    const shape = normalizeCommentShape(comment);

    return FACET_FIELDS.every((field) => {
        const selectionField = getSelectionFieldName(field);
        const selectionSet = normalized[selectionField];
        return selectionMatches(selectionSet, getNormalizedFacetValue(shape, field));
    });
}

export function getIssueFilterSummary(filters) {
    const normalized = normalizeIssueFilters(filters);
    const active = [];

    if (!isDefaultIssueSeveritySelection(normalized.severities)) {
        active.push(`Severity: ${normalized.severities.size}`);
    }
    if (normalized.confidences) {
        active.push(`Confidence: ${normalized.confidences.size}`);
    }
    if (normalized.types) {
        active.push(`Type: ${normalized.types.size}`);
    }
    if (normalized.categories) {
        active.push(`Main Category: ${normalized.categories.size}`);
    }
    if (normalized.subcategories) {
        active.push(`Subcategory: ${normalized.subcategories.size}`);
    }

    return active;
}

export function buildCommentVisibilityKey(filePath, comment) {
    const path = filePath || comment?.FilePath || comment?.file_path || comment?.filePath || '';
    const shape = normalizeCommentShape(comment);
    const content = shape.content.replace(/\s+/g, ' ');
    return `${path}::${shape.line}::${shape.severity}::${normalizeFacetValue(shape.confidence)}::${normalizeFacetValue(shape.type)}::${normalizeFacetValue(shape.category)}::${normalizeFacetValue(shape.subcategory)}::${content}`;
}

export function countFileVisibleIssues(file, filters, hiddenCommentKeys) {
    let visible = 0;
    iterateIssueComments([file], ({ filePath, comment }) => {
        if (hiddenCommentKeys instanceof Set && hiddenCommentKeys.has(buildCommentVisibilityKey(filePath, comment))) {
            return;
        }
        if (matchesIssueFilters(comment, filters)) {
            visible++;
        }
    });
    return visible;
}

export function countIssuesByFilters(files, filters, hiddenCommentKeys) {
    const severityCounts = {
        critical: 0,
        error: 0,
        warning: 0,
        info: 0,
    };
    let total = 0;
    let visible = 0;

    iterateIssueComments(files, ({ filePath, comment }) => {
        const shape = normalizeCommentShape(comment);
        total++;
        severityCounts[shape.severity] = (severityCounts[shape.severity] || 0) + 1;
        if (hiddenCommentKeys instanceof Set && hiddenCommentKeys.has(buildCommentVisibilityKey(filePath, comment))) {
            return;
        }
        if (matchesIssueFilters(comment, filters)) {
            visible++;
        }
    });

    return {
        total,
        visible,
        severityCounts,
    };
}

export function buildIssueFacetOptions(files, filters, hiddenCommentKeys) {
    const normalized = normalizeIssueFilters(filters);
    const optionMaps = {
        severity: new Map(DEFAULT_SEVERITIES.map((value) => [value, { value, label: formatSeverityLabel(value), count: 0 }])),
        confidence: new Map(),
        type: new Map(),
        category: new Map(),
        subcategory: new Map(),
    };

    iterateIssueComments(files, ({ filePath, comment }) => {
        if (hiddenCommentKeys instanceof Set && hiddenCommentKeys.has(buildCommentVisibilityKey(filePath, comment))) {
            return;
        }
        const shape = normalizeCommentShape(comment);
        FACET_FIELDS.forEach((field) => {
            if (!matchesIssueFiltersExcludingField(comment, normalized, field)) {
                return;
            }
            const rawValue = shape[field];
            const normalizedValue = getNormalizedFacetValue(shape, field);
            if (!normalizedValue) {
                return;
            }
            const current = optionMaps[field].get(normalizedValue) || {
                value: normalizedValue,
                label: field === 'severity' ? formatSeverityLabel(normalizedValue) : rawValue,
                count: 0,
            };
            current.count += 1;
            optionMaps[field].set(normalizedValue, current);
        });
    });

    const categorySelection = normalized.categories;
    if (categorySelection instanceof Set && categorySelection.size > 0) {
        const scopedSubcategories = new Map();
        iterateIssueComments(files, ({ filePath, comment }) => {
            if (hiddenCommentKeys instanceof Set && hiddenCommentKeys.has(buildCommentVisibilityKey(filePath, comment))) {
                return;
            }
            const shape = normalizeCommentShape(comment);
            if (!selectionMatches(categorySelection, normalizeFacetValue(shape.category))) {
                return;
            }
            if (!shape.subcategory) {
                return;
            }
            const key = normalizeFacetValue(shape.subcategory);
            const current = optionMaps.subcategory.get(key) || {
                value: key,
                label: shape.subcategory,
                count: 0,
            };
            current.count = optionMaps.subcategory.get(key)?.count || current.count;
            scopedSubcategories.set(key, current);
        });
        optionMaps.subcategory = scopedSubcategories;
    }

    return {
        severities: sortValues(optionMaps.severity.keys(), DEFAULT_SEVERITIES).map((value) => ({
            ...optionMaps.severity.get(value),
            active: normalized.severities.has(value),
        })),
        confidences: sortValues(optionMaps.confidence.keys(), CONFIDENCE_ORDER).map((value) => ({
            ...optionMaps.confidence.get(value),
            active: !(normalized.confidences instanceof Set) || normalized.confidences.has(value),
        })),
        types: sortValues(optionMaps.type.keys()).map((value) => ({
            ...optionMaps.type.get(value),
            active: !(normalized.types instanceof Set) || normalized.types.has(value),
        })),
        categories: sortValues(optionMaps.category.keys()).map((value) => ({
            ...optionMaps.category.get(value),
            active: !(normalized.categories instanceof Set) || normalized.categories.has(value),
        })),
        subcategories: sortValues(optionMaps.subcategory.keys()).map((value) => ({
            ...optionMaps.subcategory.get(value),
            active: !(normalized.subcategories instanceof Set) || normalized.subcategories.has(value),
        })),
    };
}

export function buildIssueCategoryGroups(files, filters, hiddenCommentKeys) {
    const normalized = normalizeIssueFilters(filters);
    const categoryMap = new Map();

    iterateIssueComments(files, ({ filePath, comment }) => {
        if (hiddenCommentKeys instanceof Set && hiddenCommentKeys.has(buildCommentVisibilityKey(filePath, comment))) {
            return;
        }
        if (!matchesIssueFiltersExcludingFields(comment, normalized, ['category', 'subcategory'])) {
            return;
        }

        const shape = normalizeCommentShape(comment);
        if (!shape.category) {
            return;
        }

        const categoryValue = normalizeFacetValue(shape.category);
        const categoryIsActive = !(normalized.categories instanceof Set) || normalized.categories.has(categoryValue);
        const categoryEntry = categoryMap.get(categoryValue) || {
            value: categoryValue,
            label: shape.category,
            count: 0,
            active: categoryIsActive,
            subcategoryMap: new Map(),
        };
        categoryEntry.count += 1;

        if (shape.subcategory) {
            const subcategoryValue = normalizeFacetValue(shape.subcategory);
            const subcategoryIsActive = categoryIsActive && (
                !(normalized.subcategories instanceof Set) || normalized.subcategories.has(subcategoryValue)
            );
            const subcategoryEntry = categoryEntry.subcategoryMap.get(subcategoryValue) || {
                value: subcategoryValue,
                label: shape.subcategory,
                count: 0,
                active: subcategoryIsActive,
            };
            subcategoryEntry.count += 1;
            categoryEntry.subcategoryMap.set(subcategoryValue, subcategoryEntry);
        }

        categoryMap.set(categoryValue, categoryEntry);
    });

    return sortValues(categoryMap.keys()).map((categoryValue) => {
        const entry = categoryMap.get(categoryValue);
        const subcategories = sortValues(entry.subcategoryMap.keys()).map((subcategoryValue) => entry.subcategoryMap.get(subcategoryValue));
        return {
            value: entry.value,
            label: entry.label,
            count: entry.count,
            active: entry.active,
            subcategories,
        };
    });
}

export function getIssueFilterStats(files, filters, hiddenCommentKeys, getVisibilityKey) {
    const normalized = normalizeIssueFilters(filters);
    const facetCounts = {
        category: new Map(),
    };
    const availableSubcategories = new Set();
    let total = 0;
    let visible = 0;

    iterateIssueComments(files, ({ filePath, comment }) => {
        const visibilityKey = typeof getVisibilityKey === 'function'
            ? getVisibilityKey(filePath, comment)
            : buildCommentVisibilityKey(filePath, comment);
        if (hiddenCommentKeys instanceof Set && hiddenCommentKeys.has(visibilityKey)) {
            total++;
            return;
        }

        const shape = normalizeCommentShape(comment);
        total++;
        if (shape.category) {
            facetCounts.category.set(shape.category, (facetCounts.category.get(shape.category) || 0) + 1);
        }
        if (matchesIssueFilters(comment, normalized)) {
            visible++;
        }
        if (!(normalized.categories instanceof Set) || normalized.categories.size === 0 || normalized.categories.has(normalizeFacetValue(shape.category))) {
            if (shape.subcategory) {
                availableSubcategories.add(shape.subcategory);
            }
        }
    });

    return {
        total,
        visible,
        facetCounts,
        availableSubcategories,
    };
}
