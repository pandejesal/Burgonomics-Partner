import { useStrictWalkInMenu } from './useMenu';
import {
  evaluateWalkInEligibility,
  projectStrictWalkInCatalog,
  type RawProductDocData,
  type WalkInIneligibilityReason,
  type WalkInEligibilityResult,
  type IneligibleWalkInItem,
  type StrictWalkInCatalog,
} from './walkInCatalog';

export {
  useStrictWalkInMenu,
  evaluateWalkInEligibility,
  projectStrictWalkInCatalog,
  type RawProductDocData,
  type WalkInIneligibilityReason,
  type WalkInEligibilityResult,
  type IneligibleWalkInItem,
  type StrictWalkInCatalog,
};

export const useWalkInMenu = useStrictWalkInMenu;
export default useStrictWalkInMenu;
