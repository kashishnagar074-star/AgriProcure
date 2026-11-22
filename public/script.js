
/* =====================================
   SELECTED SLOT
===================================== */

let selectedSlot = "";

function selectSlot(button, slot) {
    selectedSlot = slot;

    document.querySelectorAll(".slot").forEach(function (item) {
        item.classList.remove("selected", "active");
        item.setAttribute("aria-pressed", "false");
    });

    button.classList.add("selected", "active");
    button.setAttribute("aria-pressed", "true");

    const selectedSlotText = document.getElementById("selectedSlot");

    if (selectedSlotText) {
        selectedSlotText.innerText = slot;
    }

    const message = document.getElementById("bookingMessage");

    if (message) {
        message.innerText = "";
    }
}

// Compatibility with the newer HTML version
function chooseAgriSlot(button, slot) {
    selectSlot(button, slot);
}


/* =====================================
   LOGIN
===================================== */

async function login() {
    const mobileElement = document.getElementById("mobile");
    const passwordElement = document.getElementById("password");
    const roleElement = document.getElementById("role");
    const message = document.getElementById("message");

    if (!mobileElement || !passwordElement || !roleElement || !message) {
        console.error("Login form elements were not found.");
        return;
    }

    const mobile = mobileElement.value.trim();
    const password = passwordElement.value;
    const role = roleElement.value;

    if (!/^\d{10}$/.test(mobile)) {
        message.style.color = "red";
        message.innerText = "Please enter a valid 10-digit mobile number.";
        return;
    }

    if (!password) {
        message.style.color = "red";
        message.innerText = "Please enter your password.";
        return;
    }

    message.style.color = "#176b3a";
    message.innerText = "Logging in...";

    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                mobile: mobile,
                role: role,
                password: password
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            message.style.color = "red";
            message.innerText = data.message || "Login failed.";
            return;
        }

        localStorage.setItem("user", JSON.stringify(data));

        message.style.color = "#176b3a";
        message.innerText = "Login successful!";

        setTimeout(function () {
            if (role === "farmer") {
                window.location.href = "/farmer-dashboard.html";
            } else if (role === "officer") {
                window.location.href = "/officerdashboard.html";
            } else if (role === "admin") {
                window.location.href = "/admindashboard.html";
            }
        }, 800);

    } catch (error) {
        message.style.color = "red";
        message.innerText = "Unable to connect to server.";
        console.error("Login error:", error);
    }
}


/* =====================================
   CONFIRM BOOKING
===================================== */

async function confirmBooking() {
    const cropElement = document.getElementById("crop");
    const centreElement = document.getElementById("centre");
    const dateElement = document.getElementById("date");
    const message = document.getElementById("bookingMessage");
    const confirmButton = document.querySelector(".confirm-booking");

    if (!cropElement || !centreElement || !dateElement || !message) {
        console.error("Booking form elements were not found.");
        return;
    }

    const crop = cropElement.value.trim();
    const centre = centreElement.value.trim();
    const date = dateElement.value;

    // Read selected slot from JavaScript variable or visible selection.
    const slotText = document.getElementById("selectedSlot");
    let slot = selectedSlot;

    if (!slot && slotText) {
        const displayedSlot = slotText.innerText.trim();

        if (displayedSlot && displayedSlot !== "Not selected") {
            slot = displayedSlot;
        }
    }

    // Tell the farmer exactly what is missing.
    const missingFields = [];

    if (!crop) missingFields.push("Crop");
    if (!centre) missingFields.push("Procurement Centre");
    if (!date) missingFields.push("Procurement Date");
    if (!slot) missingFields.push("Time Slot");

    if (missingFields.length > 0) {
        message.style.color = "red";
        message.innerText = "Please select: " + missingFields.join(", ");
        console.log("Booking form values:", {
            crop,
            centre,
            date,
            slot
        });
        return;
    }

    let userData;

    try {
        userData = JSON.parse(localStorage.getItem("user") || "null");
    } catch (error) {
        userData = null;
    }

    if (!userData || !userData.token || !userData.user) {
        message.style.color = "red";
        message.innerText = "Please login again.";
        return;
    }

    if (userData.user.role !== "farmer") {
        message.style.color = "red";
        message.innerText = "Only farmers can book slots.";
        return;
    }

    const booking = {
        crop: crop,
        centre: centre,
        date: date,
        slot: slot
    };

    message.style.color = "#176b3a";
    message.innerText = "Booking your slot...";

    if (confirmButton) {
        confirmButton.disabled = true;
    }

    try {
        const response = await fetch("/api/bookings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + userData.token
            },
            body: JSON.stringify(booking)
        });

        const data = await response.json();

        if (!response.ok || !data.success || !data.booking) {
            throw new Error(data.message || "Booking failed.");
        }

        localStorage.setItem(
            "bookingData",
            JSON.stringify(data.booking)
        );

        message.style.color = "#176b3a";
        message.innerText = "Slot booked successfully! Redirecting...";

        setTimeout(function () {
            window.location.href = "/token.html";
        }, 1000);

    } catch (error) {
        console.error("Booking error:", error);

        message.style.color = "red";
        message.innerText = error.message || "Unable to connect to server.";

        if (confirmButton) {
            confirmButton.disabled = false;
        }
    }
}

// Compatibility with the newer HTML version
function submitAgriBooking() {
    confirmBooking();
}


/* =====================================
   NAVIGATION
===================================== */

function viewLiveQueue() {
    window.location.href = "/livequeue.html";
}

function viewProcurementStatus() {
    window.location.href = "/procurementstatus.html";
}

function goDashboard() {
    window.location.href = "/farmer-dashboard.html";
}

function bookSlot() {
    window.location.href = "/book-slot.html";
}

function logout() {
    localStorage.removeItem("user");
    localStorage.removeItem("bookingData");
    window.location.href = "/index.html";
}


/* =====================================
   PROCUREMENT STATUS
===================================== */

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
