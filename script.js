function login() {

    const mobile = document.getElementById("mobile").value;
    const role = document.getElementById("role").value;
    const message = document.getElementById("message");

    if (mobile.length !== 10 || isNaN(mobile)) {
        message.style.color = "red";
        message.innerText = "Please enter a valid 10-digit mobile number.";
        return;
    }

    message.style.color = "#176b3a";
    message.innerText = "Login successful!";

    console.log("Mobile:", mobile);
    console.log("Role:", role);

    // Temporary navigation
    setTimeout(() => {

      if (role === "farmer") {
    window.location.href = "farmer-dashboard.html";
}

else if (role === "officer") {
    window.location.href = "officerdashboard.html";
}

else {
    window.location.href = "admindashboard.html";
}  

    }, 800);
}
function bookSlot() {
    window.location.href = "book-slot.html";
}

function viewToken() {
    alert("Your Token Number is #42");
}

function viewPayment() {
    alert("Payment Status: Pending");
}

function logout() {
    window.location.href = "index22.html";
}
let selectedSlot = "";

function selectSlot(button, slotTime) {

    const slots = document.querySelectorAll(".slot");

    slots.forEach(function(slot) {
        slot.classList.remove("selected");
    });

    button.classList.add("selected");

    selectedSlot = slotTime;

    document.getElementById("selectedSlot").innerText = slotTime;
}

function confirmBooking() {
    const crop = document.getElementById("crop").value;
    const centre = document.getElementById("centre").value;
    const date = document.getElementById("date").value;
    const message = document.getElementById("bookingMessage");

    if (crop === "") {
        message.style.color = "red";
        message.innerText = "Please select your crop.";
        return;
    }

    if (centre === "") {
        message.style.color = "red";
        message.innerText = "Please select a procurement centre.";
        return;
    }

    if (date === "") {
        message.style.color = "red";
        message.innerText = "Please select a procurement date.";
        return;
    }

    if (selectedSlot === "") {
        message.style.color = "red";
        message.innerText = "Please select an available slot.";
        return;
    }

    // Generate booking data
    const booking = {
        farmer: "Ramesh Kumar",
        crop: crop,
        centre: centre,
        date: date,
        slot: selectedSlot,
        token: 42
    };

    // Save booking data
    localStorage.setItem("bookingData", JSON.stringify(booking));

    message.style.color = "#176b3a";
    message.innerText = "Slot confirmed successfully!";

    setTimeout(function () {
        window.location.href = "token.html";
    }, 1000);
}

function viewLiveQueue() {
    window.location.href = "livequeue.html";
}
function viewProcurementStatus() {
    window.location.href = "procurementstatus.html";
}

function goDashboard() {
    window.location.href = "farmer-dashboard.html";
}
// ===============================
// SHARED PROCUREMENT STATUS
// ===============================

function saveProcurementStatus() {
    localStorage.setItem("procurementStatus", "Payment Processing");
    localStorage.setItem("qualityCheck", "Completed");
    localStorage.setItem("weighing", "Completed");
    localStorage.setItem("procurement", "Completed");
    localStorage.setItem("bill", "Generated");
    localStorage.setItem("payment", "Processing");
}

function getProcurementStatus() {
    return localStorage.getItem("procurementStatus") || "Crop Reception";
}