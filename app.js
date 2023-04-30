
const API_ENDPOINT = "https://api.scryfall.com/cards/random?";
const CARD_COUNT = 15;


const revealButton = document.getElementById("reveal-cards-button");
const cardContainer = document.getElementById("card-container");


revealButton.addEventListener("click", async () => {

  revealButton.disabled = true;


  cardContainer.innerHTML = "";

  for (let i = 0; i < CARD_COUNT; i++) {
    try {
      const response = await fetch(API_ENDPOINT);
      const { image_uris } = await response.json();
      const cardImage = document.createElement("img");
      cardImage.className = "card-image";
      cardImage.src = image_uris.normal;
      cardImage.alt = "Magic: The Gathering card";
      cardContainer.appendChild(cardImage);
    } catch (error) {
      console.error(error);
    }
  }

  revealButton.disabled = false;
});
