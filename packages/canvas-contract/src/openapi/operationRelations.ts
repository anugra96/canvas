import { isObject, objectOrEmpty } from './document'
import type { JsonObject } from './types'

const MEDIA_TYPE = 'application/json'

export function attachRequestModel(operation: JsonObject, schemaName: string): JsonObject {
  const requestBody = objectOrEmpty(operation.requestBody)
  const content = objectOrEmpty(requestBody.content)
  return {
    ...operation,
    requestBody: {
      ...requestBody,
      content: {
        ...content,
        [MEDIA_TYPE]: { schema: { $ref: `#/components/schemas/${schemaName}` } },
      },
    },
  }
}

export function attachResponseModel(operation: JsonObject, status: string, schemaName: string): JsonObject {
  const responses = objectOrEmpty(operation.responses)
  const response = objectOrEmpty(responses[status])
  const content = objectOrEmpty(response.content)
  return {
    ...operation,
    responses: {
      ...responses,
      [status]: {
        ...response,
        content: {
          ...content,
          [MEDIA_TYPE]: { schema: { $ref: `#/components/schemas/${schemaName}` } },
        },
      },
    },
  }
}

export function responseHasOtherContent(operation: JsonObject, status: string, mediaType = MEDIA_TYPE): boolean {
  const response = objectOrEmpty(objectOrEmpty(operation.responses)[status])
  return Object.keys(objectOrEmpty(response.content)).some((key) => key !== mediaType)
}

export function removeModelReference(
  operation: JsonObject,
  relationType: string,
  schemaName: string,
  status?: string,
  mediaType = MEDIA_TYPE,
): JsonObject {
  if (relationType === 'accepts') {
    const requestBody = objectOrEmpty(operation.requestBody)
    const content = objectOrEmpty(requestBody.content)
    const nextContent = Object.fromEntries(Object.entries(content).filter(([key]) => key !== mediaType))
    return {
      ...operation,
      requestBody: {
        ...requestBody,
        content: nextContent,
      },
    }
  }
  if (relationType === 'returns' && status) {
    const responses = { ...objectOrEmpty(operation.responses) }
    const response = objectOrEmpty(responses[status])
    const content = { ...objectOrEmpty(response.content) }
    delete content[mediaType]
    if (Object.keys(content).length === 0) delete responses[status]
    else responses[status] = { ...response, content }
    return { ...operation, responses }
  }
  return operation
}

export function responseStatusForRef(operation: JsonObject, schemaName: string, mediaType = MEDIA_TYPE): string | undefined {
  const ref = `#/components/schemas/${schemaName}`
  for (const [status, response] of Object.entries(objectOrEmpty(operation.responses))) {
    const media = objectOrEmpty(objectOrEmpty(response).content)[mediaType]
    if (isObject(media) && objectOrEmpty(media.schema).$ref === ref) return status
  }
  return undefined
}
