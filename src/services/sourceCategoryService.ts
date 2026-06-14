import { prisma } from '../db/prisma';

type SourceCategoryRow = {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  category: string;
  programs: number;
};

type SourceCategoryGroupRow = {
  sourceId: string | null;
  category: string | null;
  _count: {
    _all: number;
  };
};

type UncategorizedSourceGroupRow = {
  sourceId: string | null;
  _count: {
    _all: number;
  };
};

function displayCategory(category: string | null | undefined) {
  const value = category?.trim();

  return value && value !== 'Uncategorized'
    ? value
    : 'General';
}

export async function getSourceCategories() {
  const [
    sources,
    categoryRows,
    uncategorizedRows
  ] = await Promise.all([
    prisma.source.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        enabled: true
      },
      orderBy: {
        priority: 'asc'
      }
    }),
    prisma.program.groupBy({
      by: ['sourceId', 'category'],
      where: {
        sourceId: {
          not: null
        },
        category: {
          not: null
        }
      },
      _count: {
        _all: true
      },
      orderBy: [
        {
          sourceId: 'asc'
        },
        {
          _count: {
            category: 'desc'
          }
        }
      ]
    }),
    prisma.program.groupBy({
      by: ['sourceId'],
      where: {
        sourceId: {
          not: null
        },
        category: null
      },
      _count: {
        _all: true
      }
    })
  ]);

  const typedCategoryRows: SourceCategoryGroupRow[] = categoryRows;
  const typedUncategorizedRows: UncategorizedSourceGroupRow[] = uncategorizedRows;
  const sourcesById = new Map(
    sources.map((source) => [source.id, source])
  );
  const rowsBySourceCategory = new Map<string, SourceCategoryRow>();
  const addRow = (
    sourceId: string,
    category: string,
    programs: number
  ) => {
    const source = sourcesById.get(sourceId);
    const key = `${sourceId}\0${category}`;
    const existing = rowsBySourceCategory.get(key);

    if (existing) {
      existing.programs += programs;
      return;
    }

    rowsBySourceCategory.set(key, {
      sourceId,
      sourceName: source?.name ?? 'Unknown source',
      sourceType: source?.type ?? 'unknown',
      category,
      programs
    });
  };

  typedCategoryRows.forEach((row) => {
    if (!row.sourceId) return [];

    addRow(
      row.sourceId,
      displayCategory(row.category),
      row._count._all
    );
  });

  for (const row of typedUncategorizedRows) {
    if (!row.sourceId) continue;

    addRow(
      row.sourceId,
      'General',
      row._count._all
    );
  }

  const rows = [...rowsBySourceCategory.values()];
  const summary = sources.map((source) => {
    const sourceRows = rows
      .filter((row) => row.sourceId === source.id)
      .sort((a, b) => b.programs - a.programs);
    const totalPrograms = sourceRows.reduce(
      (sum, row) => sum + row.programs,
      0
    );

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      enabled: source.enabled,
      categories: sourceRows.length,
      programs: totalPrograms,
      topCategories: sourceRows.slice(0, 8).map((row) => `${row.category} (${row.programs})`).join(', ')
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    sources: summary,
    categories: rows.sort((a, b) =>
      a.sourceName.localeCompare(b.sourceName) ||
      b.programs - a.programs ||
      a.category.localeCompare(b.category)
    )
  };
}
