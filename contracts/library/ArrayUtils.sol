// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20;

library ArrayUtils {
    /**
     * Finds the index of the first occurrence of the given element.
     * @param A The input array to search
     * @param a The value to find
     * @return Returns (index and isIn) for the first occurrence starting from index 0
     */
    function indexOf(
        address[] memory A,
        address a
    ) internal pure returns (uint256, bool) {
        uint256 length = A.length;
        for (uint256 i = 0; i < length; i++) {
            if (A[i] == a) {
                return (i, true);
            }
        }
        return (0, false);
    }

    /**
     * Returns true if the value is present in the list. Uses indexOf internally.
     * @param A The input array to search
     * @param a The value to find
     * @return Returns isIn for the first occurrence starting from index 0
     */
    function contains(
        address[] memory A,
        address a
    ) internal pure returns (bool) {
        (, bool isIn) = indexOf(A, a);
        return isIn;
    }

    /// @return Returns index and isIn for the first occurrence starting from
    /// end
    function indexOfFromEnd(
        address[] memory A,
        address a
    ) internal pure returns (uint256, bool) {
        uint256 length = A.length;
        for (uint256 i = length; i > 0; i--) {
            if (A[i - 1] == a) {
                return (i, true);
            }
        }
        return (0, false);
    }
}
