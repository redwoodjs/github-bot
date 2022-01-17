import {
  addToProject,
  deleteFromProject,
  updateProjectItemField,
} from 'src/services/projects'
import { removeLabels } from 'src/services/labels'

const projectId = process.env.RELEASE_PROJECT_ID

export function addToReleaseProject({ contentId }: { contentId: string }) {
  return addToProject({ projectId, contentId })
}

export function deleteFromReleaseProject({ itemId }: { itemId: string }) {
  return deleteFromProject({ projectId, itemId })
}

/**
 * Give PRs opened by core team maintainers the "In progress" status.
 */
export function updateReleaseField({
  itemId,
  fieldId,
  value,
}: {
  itemId: string
  fieldId: string
  value: string
}) {
  return updateProjectItemField({ projectId, itemId, fieldId, value })
}

function updateReleaseStatusField({
  itemId,
  value,
}: {
  itemId: string
  value: string
}) {
  return updateReleaseField({
    itemId,
    fieldId: process.env.RELEASE_STATUS_FIELD_ID,
    value,
  })
}

export function updateReleaseStatusFieldToInProgress({
  itemId,
}: {
  itemId: string
}) {
  return updateReleaseStatusField({
    itemId,
    value: process.env.IN_PROGRESS_STATUS_FIELD_ID,
  })
}

export function updateReleaseStatusFieldToNewPRs({
  itemId,
}: {
  itemId: string
}) {
  return updateReleaseStatusField({
    itemId,
    value: process.env.NEW_PRS_STATUS_FIELD_ID,
  })
}

export const RW_ADD_TO_RELEASE_LABEL_ID = 'LA_kwDOC2M2f87erIv2'

export function removeAddToReleaseLabel({
  labelableId,
}: {
  labelableId: string
}) {
  return removeLabels({
    labelableId,
    labelIds: [process.env.ADD_TO_RELEASE_LABEL_ID],
  })
}
