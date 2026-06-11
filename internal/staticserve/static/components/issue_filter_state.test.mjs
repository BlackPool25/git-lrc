import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildCommentVisibilityKey,
    buildIssueCategoryGroups,
    buildIssueFacetOptions,
    countFileVisibleIssues,
    countIssuesByFilters,
    createDefaultIssueFilters,
    getCommentFilterValue,
    getIssueFilterStats,
    getIssueFilterSummary,
    hasActiveIssueFilters,
    matchesIssueFilters,
    normalizeIssueFilters,
    resetIssueFilters,
    toggleIssueFilterValue,
} from './issue_filter_state.mjs';

function buildFiles() {
    return [
        {
            FilePath: 'README.md',
            Hunks: [
                {
                    Lines: [
                        {
                            IsComment: true,
                            Comments: [
                                {
                                    Severity: 'CRITICAL',
                                    Confidence: 'High',
                                    Type: 'Best Practice',
                                    Category: 'Documentation',
                                    Subcategory: 'Missing Prerequisites',
                                    Content: 'Document the runtime requirements.',
                                    Line: 12,
                                },
                                {
                                    Severity: 'WARNING',
                                    Confidence: 'Medium',
                                    Type: 'Risk',
                                    Category: 'Documentation',
                                    Subcategory: 'Broken Links',
                                    Content: 'One of the links is stale.',
                                    Line: 20,
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            FilePath: 'parser.go',
            Hunks: [
                {
                    Lines: [
                        {
                            IsComment: true,
                            Comments: [
                                {
                                    Severity: 'ERROR',
                                    Confidence: 'High',
                                    Type: 'Bug',
                                    Category: 'Logic',
                                    Subcategory: 'Parser Mismatch',
                                    Content: 'The parser contract is inconsistent.',
                                    Line: 7,
                                },
                                {
                                    Severity: 'INFO',
                                    Confidence: 'Low',
                                    Type: 'Optimization',
                                    Category: 'Style',
                                    Subcategory: 'String Processing',
                                    Content: 'Combine string transforms.',
                                    Line: 13,
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ];
}

test('createDefaultIssueFilters selects all severities and no secondary facets', () => {
    const filters = createDefaultIssueFilters();

    assert.deepEqual([...filters.severities], ['critical', 'error', 'warning', 'info']);
    assert.equal(filters.confidences, null);
    assert.equal(filters.types, null);
    assert.equal(filters.categories, null);
    assert.equal(filters.subcategories, null);
    assert.equal(hasActiveIssueFilters(filters), false);
});

test('matchesIssueFilters applies multi-factor selection semantics', () => {
    const filters = normalizeIssueFilters({
        severities: new Set(['critical', 'warning']),
        confidences: new Set(['high']),
        categories: new Set(['documentation']),
    });

    assert.equal(matchesIssueFilters({ Severity: 'CRITICAL', Confidence: 'High', Category: 'Documentation' }, filters), true);
    assert.equal(matchesIssueFilters({ Severity: 'WARNING', Confidence: 'Medium', Category: 'Documentation' }, filters), false);
    assert.equal(matchesIssueFilters({ Severity: 'ERROR', Confidence: 'High', Category: 'Logic' }, filters), false);
});

test('buildIssueFacetOptions narrows subcategories by the active main-category filter', () => {
    const filters = normalizeIssueFilters({
        categories: new Set(['documentation']),
    });

    const options = buildIssueFacetOptions(buildFiles(), filters, new Set());

    assert.deepEqual(
        options.subcategories.map((option) => [option.value, option.count]),
        [
            ['broken links', 1],
            ['missing prerequisites', 1],
        ],
    );
    assert.deepEqual(
        options.severities.map((option) => [option.value, option.count]),
        [
            ['critical', 1],
            ['error', 0],
            ['warning', 1],
            ['info', 0],
        ],
    );
});

test('buildIssueFacetOptions treats confidence and type filters as active by default', () => {
    const options = buildIssueFacetOptions(buildFiles(), createDefaultIssueFilters(), new Set());

    assert.deepEqual(
        options.confidences.map((option) => [option.value, option.active]),
        [
            ['high', true],
            ['medium', true],
            ['low', true],
        ],
    );
    assert.deepEqual(
        options.types.map((option) => [option.value, option.active]),
        [
            ['best practice', true],
            ['bug', true],
            ['optimization', true],
            ['risk', true],
        ],
    );
});

test('buildIssueCategoryGroups preserves the category to subcategory relationship visually', () => {
    const groups = buildIssueCategoryGroups(buildFiles(), normalizeIssueFilters({}), new Set());

    assert.deepEqual(
        groups.map((group) => ({
            label: group.label,
            subcategories: group.subcategories.map((subcategory) => subcategory.label),
        })),
        [
            {
                label: 'Documentation',
                subcategories: ['Broken Links', 'Missing Prerequisites'],
            },
            {
                label: 'Logic',
                subcategories: ['Parser Mismatch'],
            },
            {
                label: 'Style',
                subcategories: ['String Processing'],
            },
        ],
    );
});

test('buildIssueCategoryGroups keeps category order stable when a category becomes active', () => {
    const files = buildFiles();
    const baseline = buildIssueCategoryGroups(files, normalizeIssueFilters({}), new Set());
    const active = buildIssueCategoryGroups(files, normalizeIssueFilters({
        categories: new Set(['logic']),
    }), new Set());

    assert.deepEqual(
        baseline.map((group) => group.label),
        active.map((group) => group.label),
    );
});

test('buildIssueCategoryGroups treats all categories and subcategories as active by default', () => {
    const groups = buildIssueCategoryGroups(buildFiles(), normalizeIssueFilters({}), new Set());

    assert.deepEqual(
        groups.map((group) => ({
            label: group.label,
            active: group.active,
            subcategories: group.subcategories.map((subcategory) => ({
                label: subcategory.label,
                active: subcategory.active,
            })),
        })),
        [
            {
                label: 'Documentation',
                active: true,
                subcategories: [
                    { label: 'Broken Links', active: true },
                    { label: 'Missing Prerequisites', active: true },
                ],
            },
            {
                label: 'Logic',
                active: true,
                subcategories: [{ label: 'Parser Mismatch', active: true }],
            },
            {
                label: 'Style',
                active: true,
                subcategories: [{ label: 'String Processing', active: true }],
            },
        ],
    );
});

test('toggleIssueFilterValue clears dependent subcategories when deselecting a main category', () => {
    const next = toggleIssueFilterValue(normalizeIssueFilters({
        categories: new Set(['documentation', 'logic']),
        subcategories: new Set(['broken links', 'missing prerequisites', 'parser mismatch']),
    }), 'category', 'documentation', {
        childValues: ['broken links', 'missing prerequisites'],
    });

    assert.deepEqual([...next.categories].sort(), ['logic']);
    assert.deepEqual([...next.subcategories].sort(), ['parser mismatch']);
});

test('toggleIssueFilterValue disables the clicked main category when all categories are currently selected', () => {
    const next = toggleIssueFilterValue(createDefaultIssueFilters(), 'category', 'documentation', {
        allValues: ['documentation', 'logic', 'style'],
        childValues: ['broken links', 'missing prerequisites'],
        allChildValues: ['broken links', 'missing prerequisites', 'parser mismatch', 'string processing'],
    });

    assert.deepEqual([...next.categories].sort(), ['logic', 'style']);
    assert.deepEqual([...next.subcategories].sort(), ['parser mismatch', 'string processing']);
});

test('toggleIssueFilterValue re-enables a disabled main category together with its subcategories', () => {
    const next = toggleIssueFilterValue(normalizeIssueFilters({
        categories: new Set(['logic', 'style']),
        subcategories: new Set(['parser mismatch', 'string processing']),
    }), 'category', 'documentation', {
        allValues: ['documentation', 'logic', 'style'],
        childValues: ['broken links', 'missing prerequisites'],
        allChildValues: ['broken links', 'missing prerequisites', 'parser mismatch', 'string processing'],
    });

    assert.equal(next.categories, null);
    assert.equal(next.subcategories, null);
});

test('toggleIssueFilterValue toggles an individual subcategory off and back on', () => {
    const disabled = toggleIssueFilterValue(createDefaultIssueFilters(), 'subcategory', 'broken links', {
        allValues: ['broken links', 'missing prerequisites', 'parser mismatch', 'string processing'],
    });

    assert.deepEqual([...disabled.subcategories].sort(), ['missing prerequisites', 'parser mismatch', 'string processing']);

    const reenabled = toggleIssueFilterValue(disabled, 'subcategory', 'broken links', {
        allValues: ['broken links', 'missing prerequisites', 'parser mismatch', 'string processing'],
    });

    assert.equal(reenabled.subcategories, null);
});

test('countIssuesByFilters and countFileVisibleIssues exclude hidden comments from visible totals', () => {
    const files = buildFiles();
    const filters = normalizeIssueFilters({
        categories: new Set(['documentation']),
    });
    const hiddenCommentKeys = new Set([
        buildCommentVisibilityKey('README.md', {
            Severity: 'WARNING',
            Confidence: 'Medium',
            Type: 'Risk',
            Category: 'Documentation',
            Subcategory: 'Broken Links',
            Content: 'One of the links is stale.',
            Line: 20,
        }),
    ]);

    const counts = countIssuesByFilters(files, filters, hiddenCommentKeys);

    assert.equal(counts.total, 4);
    assert.equal(counts.visible, 1);
    assert.equal(countFileVisibleIssues(files[0], filters, hiddenCommentKeys), 1);
});

test('getIssueFilterStats returns visible counts and dependent subcategory availability', () => {
    const files = buildFiles();
    const filters = normalizeIssueFilters({
        categories: new Set(['documentation']),
    });

    const stats = getIssueFilterStats(files, filters, new Set([buildCommentVisibilityKey('parser.go', {
        Severity: 'INFO',
        Confidence: 'Low',
        Type: 'Optimization',
        Category: 'Style',
        Subcategory: 'String Processing',
        Content: 'Combine string transforms.',
        Line: 13,
    })]), (filePath, comment) => buildCommentVisibilityKey(filePath, comment));

    assert.equal(stats.total, 4);
    assert.equal(stats.visible, 2);
    assert.equal(stats.facetCounts.category.get('Documentation'), 2);
    assert.deepEqual([...stats.availableSubcategories].sort(), ['Broken Links', 'Missing Prerequisites']);
});

test('issue filter summary only reports active restrictions beyond defaults', () => {
    const summary = getIssueFilterSummary(normalizeIssueFilters({
        severities: new Set(['critical', 'warning']),
        confidences: new Set(['high']),
    }));

    assert.deepEqual(summary, ['Severity: 2', 'Confidence: 1']);
});

test('getCommentFilterValue exposes raw main and subcategory facets', () => {
    const [file] = buildFiles();
    const comment = file.Hunks[0].Lines[0].Comments[0];

    assert.equal(getCommentFilterValue(comment, 'category'), 'Documentation');
    assert.equal(getCommentFilterValue(comment, 'subcategory'), 'Missing Prerequisites');
});

test('buildCommentVisibilityKey distinguishes comments across metadata dimensions', () => {
    const left = buildCommentVisibilityKey('README.md', {
        Severity: 'CRITICAL',
        Confidence: 'High',
        Type: 'Best Practice',
        Category: 'Documentation',
        Subcategory: 'Missing Prerequisites',
        Content: 'Document the runtime requirements.',
        Line: 12,
    });
    const right = buildCommentVisibilityKey('README.md', {
        Severity: 'CRITICAL',
        Confidence: 'High',
        Type: 'Risk',
        Category: 'Documentation',
        Subcategory: 'Missing Prerequisites',
        Content: 'Document the runtime requirements.',
        Line: 12,
    });

    assert.notEqual(left, right);
});

test('resetIssueFilters restores defaults', () => {
    const reset = resetIssueFilters();
    assert.deepEqual([...reset.severities].sort(), ['critical', 'error', 'info', 'warning']);
    assert.equal(reset.confidences, null);
});
