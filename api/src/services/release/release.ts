import {
  addToProject,
  deleteFromProject,
  updateProjectItemField,
} from 'src/services/projects'
import { removeLabels } from 'src/services/labels'

export const RW_RELEASE_PROJECT_ID = 'PN_kwDOAq9qTM4AARb-'

export function addToReleaseProject({ contentId }: { contentId: string }) {
  const projectId =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_RELEASE_PROJECT_ID
      : RW_RELEASE_PROJECT_ID

  return addToProject({ projectId, contentId })
}

export function deleteFromReleaseProject({ itemId }: { itemId: string }) {
  const projectId =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_RELEASE_PROJECT_ID
      : RW_RELEASE_PROJECT_ID

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
  const projectId =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_RELEASE_PROJECT_ID
      : RW_RELEASE_PROJECT_ID

  return updateProjectItemField({ projectId, itemId, fieldId, value })
}

export const RW_RELEASE_STATUS_FIELD_ID = 'MDE2OlByb2plY3ROZXh0RmllbGQ1NDExMjE='

function updateReleaseStatusField({
  itemId,
  value,
}: {
  itemId: string
  value: string
}) {
  const fieldId =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_RELEASE_STATUS_FIELD_ID
      : RW_RELEASE_STATUS_FIELD_ID

  return updateReleaseField({ itemId, fieldId, value })
}

export const RW_IN_PROGRESS_STATUS_FIELD_ID = '98236657'

export function updateReleaseStatusFieldToInProgress({
  itemId,
}: {
  itemId: string
}) {
  const value =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_IN_PROGRESS_STATUS_FIELD_ID
      : RW_IN_PROGRESS_STATUS_FIELD_ID

  return updateReleaseStatusField({ itemId, value })
}

export const RW_NEW_PRS_STATUS_FIELD_ID = '62e9c111'

export function updateReleaseStatusFieldToNewPRs({
  itemId,
}: {
  itemId: string
}) {
  const value =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_NEW_PRS_STATUS_FIELD_ID
      : RW_NEW_PRS_STATUS_FIELD_ID

  return updateReleaseStatusField({ itemId, value })
}

export const RW_ADD_TO_RELEASE_LABEL_ID = 'LA_kwDOC2M2f87erIv2'

export function removeAddToReleaseLabel({
  labelableId,
}: {
  labelableId: string
}) {
  const labelId =
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_ADD_TO_RELEASE_LABEL_ID
      : RW_ADD_TO_RELEASE_LABEL_ID

  return removeLabels({ labelableId, labelIds: [labelId] })
}
