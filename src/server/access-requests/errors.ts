// Access Request Engine — доменные ошибки (по образцу src/server/events/event-service.ts,
// не общей DomainError-иерархии движка соревнований — это слой 1).

export class AccessRequestForbiddenError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export class AccessRequestNotFoundError extends Error {}

export class AccessRequestAlreadyReviewedError extends Error {}

export class AccessRequestValidationError extends Error {
  constructor(public issues: string[]) {
    super("access_request_invalid");
  }
}
