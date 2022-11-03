//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RewardNft is ERC721URIStorage, Ownable {
     using Strings for uint256;
     using Counters for Counters.Counter;
     Counters.Counter private _tokenIds;

     constructor() ERC721("Chain Battles", "CBTLS") Ownable(){

     }

    function generateTokenURI(uint256 tokenId, string memory svg ) private pure returns (string memory){
       bytes memory dataURI = abi.encodePacked(
        '{',
            '"name": "Attack Of the clones #', tokenId.toString(), '",',
            '"description": "Battles on chain",',
            '"image": "', svg, '"',
        '}'
        );

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(dataURI)
            )
        );
    } 

    function mint(address to, string memory svg) external onlyOwner() returns(uint256) {
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _safeMint(to, newItemId);
        _setTokenURI(newItemId, generateTokenURI(newItemId, svg));
        return newItemId;
    }
}

interface IRewardNft {
    function mint(address to, string memory svg) external returns(uint256);
}