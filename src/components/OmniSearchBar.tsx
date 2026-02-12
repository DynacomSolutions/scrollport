import { useEffect, useMemo, useRef, useState, type KeyboardEventHandler } from 'react'

export const RAW_SEARCH_PILL_ID = '__omni_raw_search__'

export type OmniSearchColumn<TData> = {
  id: string
  label: string
  kind: 'text' | 'enum' | 'number' | 'date'
  getValue: (row: TData) => unknown
  enumOptions?: string[]
}

export type OmniSearchPill = {
  columnId: string
  label: string
  value: string
  values?: string[]
}

export type OmniSearchState = {
  globalQuery: string
  pills: OmniSearchPill[]
}

type OmniSearchBarProps<TData> = {
  columns: OmniSearchColumn<TData>[]
  onChange: (next: OmniSearchState) => void
  initialState?: OmniSearchState
}

type MainSuggestion<TData> =
  | { kind: 'raw'; query: string }
  | { kind: 'field'; column: OmniSearchColumn<TData> }

function includesInsensitive(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase())
}

export function OmniSearchBar<TData>({ columns, onChange, initialState }: OmniSearchBarProps<TData>) {
  const globalInputRef = useRef<HTMLInputElement>(null)
  const pillInputRef = useRef<HTMLInputElement>(null)

  const [isFocused, setIsFocused] = useState(false)
  const [globalQueryDraft, setGlobalQueryDraft] = useState(() => initialState?.globalQuery ?? '')
  const [pills, setPills] = useState<OmniSearchPill[]>(() => initialState?.pills ?? [])
  const [activePillIndex, setActivePillIndex] = useState<number | null>(null)
  const [editingPillIndex, setEditingPillIndex] = useState<number | null>(null)
  const [editingInput, setEditingInput] = useState('')
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(-1)

  const editingPill = editingPillIndex !== null ? pills[editingPillIndex] ?? null : null
  const editingColumn = useMemo(
    () => (editingPill ? columns.find((column) => column.id === editingPill.columnId) ?? null : null),
    [columns, editingPill],
  )
  const isEditingEnum = !!editingColumn && editingColumn.kind === 'enum'

  const fieldSuggestions = useMemo(() => {
    if (editingPill) {
      return [] as OmniSearchColumn<TData>[]
    }
    const query = globalQueryDraft.trim()
    if (!query) {
      return [] as OmniSearchColumn<TData>[]
    }
    return columns.filter((column) => includesInsensitive(column.label, query)).slice(0, 8)
  }, [columns, editingPill, globalQueryDraft])

  const mainSuggestions = useMemo<MainSuggestion<TData>[]>(() => {
    if (editingPill) {
      return []
    }
    const query = globalQueryDraft.trim()
    if (!query) {
      return []
    }
    return [{ kind: 'raw', query }, ...fieldSuggestions.map((column) => ({ kind: 'field' as const, column }))]
  }, [editingPill, fieldSuggestions, globalQueryDraft])

  const enumSuggestions = useMemo(() => {
    if (!isEditingEnum || !editingColumn) {
      return [] as string[]
    }
    const query = editingInput.trim()
    const options = editingColumn.enumOptions ?? []
    if (!query) {
      return options.slice(0, 16)
    }
    return options.filter((option) => includesInsensitive(option, query)).slice(0, 16)
  }, [editingColumn, editingInput, isEditingEnum])

  const selectedEnumValues = useMemo(() => {
    if (!editingPill || !isEditingEnum) {
      return [] as string[]
    }
    return editingPill.values ?? []
  }, [editingPill, isEditingEnum])

  const suggestionCount = editingPill ? enumSuggestions.length : mainSuggestions.length

  useEffect(() => {
    setActiveSuggestionIndex(suggestionCount > 0 ? 0 : -1)
  }, [suggestionCount])

  useEffect(() => {
    onChange({
      globalQuery: '',
      pills,
    })
  }, [onChange, pills])

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      const isModF = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f'
      if (!isModF) {
        return
      }
      event.preventDefault()
      setIsFocused(true)
      setEditingPillIndex(null)
      setActivePillIndex(null)
      globalInputRef.current?.focus()
      globalInputRef.current?.select()
    }

    window.addEventListener('keydown', onWindowKeyDown)
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown)
    }
  }, [])

  const focusGlobalInput = () => {
    requestAnimationFrame(() => {
      globalInputRef.current?.focus()
    })
  }

  const focusPillInput = () => {
    requestAnimationFrame(() => {
      pillInputRef.current?.focus()
      pillInputRef.current?.setSelectionRange(pillInputRef.current.value.length, pillInputRef.current.value.length)
    })
  }

  const removePillAt = (index: number) => {
    setPills((current) => current.filter((_, pillIndex) => pillIndex !== index))

    setActivePillIndex((current) => {
      if (current === null) {
        return null
      }
      if (current === index) {
        return index > 0 ? index - 1 : null
      }
      if (current > index) {
        return current - 1
      }
      return current
    })

    setEditingPillIndex((current) => {
      if (current === null) {
        return null
      }
      if (current === index) {
        focusGlobalInput()
        return null
      }
      if (current > index) {
        return current - 1
      }
      return current
    })
  }

  const startEditingPill = (index: number) => {
    const pill = pills[index]
    if (!pill) {
      return
    }
    const column = columns.find((item) => item.id === pill.columnId)
    const enumField = column?.kind === 'enum'

    setEditingPillIndex(index)
    setActivePillIndex(null)
    setIsFocused(true)
    setActiveSuggestionIndex(0)
    setEditingInput(enumField ? '' : pill.value)
    focusPillInput()
  }

  const selectField = (column: OmniSearchColumn<TData>) => {
    const withoutExisting = pills.filter((pill) => pill.columnId !== column.id)
    const newIndex = withoutExisting.length
    setPills([
      ...withoutExisting,
      {
        columnId: column.id,
        label: column.label,
        value: '',
        values: column.kind === 'enum' ? [] : undefined,
      },
    ])
    setGlobalQueryDraft('')
    setActivePillIndex(null)
    setEditingPillIndex(newIndex)
    setEditingInput('')
    setIsFocused(true)
    focusPillInput()
  }

  const updateEditingValue = (nextValue: string) => {
    setEditingInput(nextValue)
    if (editingPillIndex === null || isEditingEnum) {
      return
    }
    setPills((current) =>
      current.map((pill, index) =>
        index === editingPillIndex
          ? {
              ...pill,
              value: nextValue,
            }
          : pill,
      ),
    )
  }

  const toggleEnumOption = (option: string) => {
    if (editingPillIndex === null || !isEditingEnum) {
      return
    }

    setPills((current) =>
      current.map((pill, index) => {
        if (index !== editingPillIndex) {
          return pill
        }
        const existing = pill.values ?? []
        const exists = existing.some((item) => item.toLowerCase() === option.toLowerCase())
        const values = exists ? existing.filter((item) => item.toLowerCase() !== option.toLowerCase()) : [...existing, option]
        return {
          ...pill,
          values,
          value: values.join(' OR '),
        }
      }),
    )
  }

  const commitEditingPill = () => {
    if (editingPillIndex !== null && !isEditingEnum) {
      setPills((current) =>
        current.map((pill, index) =>
          index === editingPillIndex
            ? {
                ...pill,
                value: editingInput,
              }
            : pill,
        ),
      )
    }

    setEditingPillIndex(null)
    setActivePillIndex(null)
    setEditingInput('')
    focusGlobalInput()
  }

  const commitRawSearch = () => {
    const query = globalQueryDraft.trim()
    if (!query) {
      return
    }

    setPills((current) => {
      const withoutRaw = current.filter((pill) => pill.columnId !== RAW_SEARCH_PILL_ID)
      return [
        ...withoutRaw,
        {
          columnId: RAW_SEARCH_PILL_ID,
          label: 'Search',
          value: query,
        },
      ]
    })
    setGlobalQueryDraft('')
    setActivePillIndex(null)
    setEditingPillIndex(null)
    setEditingInput('')
    focusGlobalInput()
  }

  const clearAll = () => {
    setGlobalQueryDraft('')
    setPills([])
    setActivePillIndex(null)
    setEditingPillIndex(null)
    setEditingInput('')
    setIsFocused(true)
    focusGlobalInput()
  }

  const moveSuggestion = (direction: 1 | -1) => {
    if (suggestionCount <= 0) {
      return
    }
    setActiveSuggestionIndex((current) => {
      const from = current < 0 ? 0 : current
      return (from + direction + suggestionCount) % suggestionCount
    })
  }

  const onGlobalKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'ArrowLeft') {
      const target = event.currentTarget
      const atStart = target.selectionStart === 0 && target.selectionEnd === 0
      if (!atStart) {
        return
      }

      if (activePillIndex === null && pills.length > 0) {
        event.preventDefault()
        setActivePillIndex(pills.length - 1)
        return
      }

      if (activePillIndex !== null) {
        event.preventDefault()
        setActivePillIndex((current) => (current !== null ? Math.max(0, current - 1) : null))
        return
      }
    }

    if (event.key === 'ArrowRight' && activePillIndex !== null) {
      event.preventDefault()
      setActivePillIndex((current) => {
        if (current === null) {
          return null
        }
        return current >= pills.length - 1 ? null : current + 1
      })
      return
    }

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestionCount > 0 && !editingPill) {
      event.preventDefault()
      moveSuggestion(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if (event.key === 'Enter') {
      if (!editingPill && mainSuggestions.length > 0 && activeSuggestionIndex >= 0) {
        event.preventDefault()
        const selected = mainSuggestions[activeSuggestionIndex]
        if (selected?.kind === 'field') {
          selectField(selected.column)
        } else if (selected?.kind === 'raw') {
          commitRawSearch()
        }
        return
      }

      if (!editingPill) {
        event.preventDefault()
        commitRawSearch()
        return
      }

      if (activePillIndex !== null) {
        event.preventDefault()
        startEditingPill(activePillIndex)
      }
      return
    }

    if (event.key === 'Backspace' && globalQueryDraft.length === 0) {
      if (activePillIndex === null && pills.length > 0) {
        event.preventDefault()
        setActivePillIndex(pills.length - 1)
        return
      }

      if (activePillIndex !== null) {
        event.preventDefault()
        removePillAt(activePillIndex)
      }
      return
    }

    if (activePillIndex !== null && event.key.length === 1) {
      setActivePillIndex(null)
    }
  }

  const onEditingPillKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && enumSuggestions.length > 0) {
      event.preventDefault()
      moveSuggestion(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if (event.key === ' ' && isEditingEnum && enumSuggestions.length > 0 && activeSuggestionIndex >= 0) {
      event.preventDefault()
      const option = enumSuggestions[activeSuggestionIndex]
      if (option) {
        toggleEnumOption(option)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      commitEditingPill()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      commitEditingPill()
      return
    }

    if (event.key === 'Backspace') {
      const target = event.currentTarget
      const atStart = target.selectionStart === 0 && target.selectionEnd === 0
      if (atStart && editingPillIndex !== null) {
        event.preventDefault()
        setActivePillIndex(editingPillIndex)
        setEditingPillIndex(null)
        setEditingInput('')
        focusGlobalInput()
      }
      return
    }

    if (event.key === 'ArrowLeft') {
      const target = event.currentTarget
      const atStart = target.selectionStart === 0 && target.selectionEnd === 0
      if (atStart && editingPillIndex !== null) {
        event.preventDefault()
        setActivePillIndex(editingPillIndex)
        setEditingPillIndex(null)
        setEditingInput('')
        focusGlobalInput()
      }
    }
  }

  const showFieldSuggestions = isFocused && !editingPill && mainSuggestions.length > 0
  const showEnumSuggestions = isFocused && !!editingPill && enumSuggestions.length > 0
  const canClear = globalQueryDraft.trim().length > 0 || pills.length > 0

  return (
    <div className="omni-wrap">
      <div className="omni-shell" data-focused={isFocused ? 'true' : 'false'}>
        <div className="omni-input-row">
          <span className="omni-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" focusable="false" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <line x1="16" y1="16" x2="21" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>

          <div className="omni-pill-row">
            {pills.map((pill, index) => {
              const displayValue = pill.values && pill.values.length > 0 ? pill.values.join(' OR ') : pill.value

              if (editingPillIndex === index) {
                return (
                  <span key={pill.columnId} className="omni-pill omni-pill-editing">
                    <strong>{pill.label}</strong>
                    <input
                      ref={pillInputRef}
                      className="omni-pill-input"
                      value={editingInput}
                      onChange={(event) => updateEditingValue(event.target.value)}
                      onKeyDown={onEditingPillKeyDown}
                      onFocus={() => setIsFocused(true)}
                      placeholder={isEditingEnum ? 'Type to filter options...' : 'Type value...'}
                    />
                  </span>
                )
              }

              return (
                <span
                  key={pill.columnId}
                  className={`omni-pill${activePillIndex === index ? ' omni-pill-active' : ''}`}
                  role="button"
                  tabIndex={-1}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    setIsFocused(true)
                    setEditingPillIndex(null)
                    setActivePillIndex(index)
                    focusGlobalInput()
                  }}
                >
                  <strong>{pill.label}</strong>
                  <span>{displayValue || 'Type value...'}</span>
                  <button
                    type="button"
                    className="omni-pill-remove"
                    aria-label={`Remove ${pill.label} filter`}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      removePillAt(index)
                      focusGlobalInput()
                    }}
                  >
                    x
                  </button>
                </span>
              )
            })}

            {editingPillIndex === null ? (
                <input
                  ref={globalInputRef}
                  type="text"
                  className="omni-input"
                  value={globalQueryDraft}
                  onChange={(event) => {
                    setGlobalQueryDraft(event.target.value)
                    if (activePillIndex !== null) {
                      setActivePillIndex(null)
                    }
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                  setTimeout(() => setIsFocused(false), 120)
                }}
                onKeyDown={onGlobalKeyDown}
                placeholder="Search everything or type a field name"
              />
            ) : null}
          </div>
          <button
            type="button"
            className="omni-clear"
            onMouseDown={(event) => {
              event.preventDefault()
              clearAll()
            }}
            aria-label="Clear search filters"
            disabled={!canClear}
          >
            x
          </button>
        </div>

        {showFieldSuggestions ? (
          <div className="omni-suggestions" role="listbox" aria-label="Field suggestions">
            {mainSuggestions.map((item, index) =>
              item.kind === 'raw' ? (
                <button
                  key={`raw-${item.query}`}
                  type="button"
                  className="omni-suggestion"
                  data-active={activeSuggestionIndex === index ? 'true' : 'false'}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    commitRawSearch()
                  }}
                >
                  <span>Search for &quot;{item.query}&quot;</span>
                  <small>all fields</small>
                </button>
              ) : (
                <button
                  key={item.column.id}
                  type="button"
                  className="omni-suggestion"
                  data-active={activeSuggestionIndex === index ? 'true' : 'false'}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectField(item.column)
                  }}
                >
                  <span>Filter by {item.column.label}</span>
                  <small>{item.column.kind}</small>
                </button>
              ),
            )}
          </div>
        ) : null}

        {showEnumSuggestions ? (
          <div className="omni-suggestions" role="listbox" aria-label="Value suggestions">
            {enumSuggestions.map((option, index) => {
              const selected = selectedEnumValues.some((value) => value.toLowerCase() === option.toLowerCase())
              return (
                <button
                  key={option}
                  type="button"
                  className="omni-suggestion"
                  data-active={activeSuggestionIndex === index ? 'true' : 'false'}
                  data-selected={selected ? 'true' : 'false'}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    toggleEnumOption(option)
                  }}
                >
                  <span>{option}</span>
                  <small>{selected ? 'selected' : 'space to toggle'}</small>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
