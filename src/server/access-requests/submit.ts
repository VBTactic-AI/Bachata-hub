import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AccessRequestValidationError } from "./errors";
import { PAYLOAD_SCHEMA_BY_TYPE, submitAccessRequestSchema, type SubmitAccessRequestInput } from "./schemas";

// Access Request Engine — подача заявки. Один визард (/become-organizer)
// может отметить несколько типов доступа сразу (пользователь явно попросил
// поддержать это — школа+фестиваль и т.п. один и тот же человек) — на выходе
// создаётся ПО ОДНОЙ строке AccessRequest на каждый тип, а не одна строка с
// массивом, чтобы супер-админ мог одобрить/отклонить/отозвать каждый тип
// независимо (см. src/server/access-requests/review.ts).
export async function submitAccessRequest(user: User, input: SubmitAccessRequestInput) {
  const parsed = submitAccessRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AccessRequestValidationError(parsed.error.issues.map((i) => i.message));
  }
  const { types, payloadByType, confirmedAccurate: _confirmedAccurate, ...common } = parsed.data;

  const validated = types.map((type) => {
    const payloadSchema = PAYLOAD_SCHEMA_BY_TYPE[type];
    const result = payloadSchema.safeParse(payloadByType[type]);
    if (!result.success) {
      throw new AccessRequestValidationError(result.error.issues.map((i) => `${type}: ${i.message}`));
    }
    return { type, payload: result.data };
  });

  return prisma.$transaction((tx) =>
    Promise.all(
      validated.map(({ type, payload }) =>
        tx.accessRequest.create({
          data: {
            userId: user.id,
            type,
            brandName: common.brandName,
            description: common.description,
            cityId: common.cityId,
            countryId: common.countryId,
            phone: common.phone,
            links: common.links,
            payload,
          },
        })
      )
    )
  );
}
