// Event Suggestion Engine — доменные ошибки (по образцу
// src/server/access-requests/errors.ts).

export class EventSuggestionForbiddenError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export class EventSuggestionNotFoundError extends Error {}

export class EventSuggestionAlreadyReviewedError extends Error {}

export class EventSuggestionValidationError extends Error {
  constructor(public issues: string[]) {
    super("event_suggestion_invalid");
  }
}
