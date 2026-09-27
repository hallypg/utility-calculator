(function () {
  "use strict";

  var STORAGE_KEY = "trip-planner-trips";

  var form = document.getElementById("trip-form");
  var idField = document.getElementById("trip-id");
  var destinationField = document.getElementById("destination");
  var dateField = document.getElementById("date");
  var durationField = document.getElementById("duration");
  var transportField = document.getElementById("transport");
  var accommodationField = document.getElementById("accommodation");
  var costField = document.getElementById("cost");
  var submitBtn = document.getElementById("submit-btn");
  var cancelBtn = document.getElementById("cancel-btn");

  var listEl = document.getElementById("trip-list");
  var emptyState = document.getElementById("empty-state");
  var tripCountEl = document.getElementById("trip-count");
  var totalCostEl = document.getElementById("total-cost");

  var trips = load();

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    } catch (e) {
      /* storage unavailable — keep working in-memory */
    }
  }

  function formatCost(value) {
    return "$" + Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(value) {
    if (!value) return "";
    var d = new Date(value + "T00:00:00");
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function render() {
    listEl.innerHTML = "";

    if (trips.length === 0) {
      listEl.appendChild(emptyState);
      emptyState.classList.remove("hidden");
    } else {
      emptyState.classList.add("hidden");
      trips.forEach(function (trip) {
        listEl.appendChild(buildCard(trip));
      });
    }

    tripCountEl.textContent = String(trips.length);
    var total = trips.reduce(function (sum, t) {
      return sum + Number(t.cost || 0);
    }, 0);
    totalCostEl.textContent = formatCost(total);
  }

  function buildCard(trip) {
    var card = document.createElement("div");
    card.className = "trip-card";

    var days = Number(trip.duration);
    var durationLabel = days + " day" + (days === 1 ? "" : "s");

    card.innerHTML =
      '<div class="trip-details">' +
        "<h3>" + escapeHtml(trip.destination) + "</h3>" +
        '<div class="trip-meta">' +
          "<span><strong>Date:</strong> " + escapeHtml(formatDate(trip.date)) + "</span>" +
          "<span><strong>Duration:</strong> " + escapeHtml(durationLabel) + "</span>" +
          "<span><strong>Transport:</strong> " + escapeHtml(trip.transport) + "</span>" +
          "<span><strong>Stay:</strong> " + escapeHtml(trip.accommodation) + "</span>" +
          '<span class="trip-cost">' + escapeHtml(formatCost(trip.cost)) + "</span>" +
        "</div>" +
      "</div>" +
      '<div class="trip-actions">' +
        '<button type="button" class="edit-btn">Edit</button>' +
        '<button type="button" class="delete-btn">Delete</button>' +
      "</div>";

    card.querySelector(".edit-btn").addEventListener("click", function () {
      startEdit(trip.id);
    });
    card.querySelector(".delete-btn").addEventListener("click", function () {
      deleteTrip(trip.id);
    });

    return card;
  }

  function startEdit(id) {
    var trip = trips.find(function (t) {
      return t.id === id;
    });
    if (!trip) return;

    idField.value = trip.id;
    destinationField.value = trip.destination;
    dateField.value = trip.date;
    durationField.value = trip.duration;
    transportField.value = trip.transport;
    accommodationField.value = trip.accommodation;
    costField.value = trip.cost;

    submitBtn.textContent = "Update trip";
    cancelBtn.classList.remove("hidden");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    form.reset();
    idField.value = "";
    submitBtn.textContent = "Add trip";
    cancelBtn.classList.add("hidden");
  }

  function deleteTrip(id) {
    trips = trips.filter(function (t) {
      return t.id !== id;
    });
    save();
    render();
    if (idField.value === id) {
      resetForm();
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var data = {
      destination: destinationField.value.trim(),
      date: dateField.value,
      duration: durationField.value,
      transport: transportField.value,
      accommodation: accommodationField.value,
      cost: costField.value,
    };

    var editingId = idField.value;
    if (editingId) {
      trips = trips.map(function (t) {
        return t.id === editingId ? Object.assign({}, t, data) : t;
      });
    } else {
      data.id = String(Date.now()) + Math.random().toString(16).slice(2);
      trips.push(data);
    }

    save();
    render();
    resetForm();
  });

  cancelBtn.addEventListener("click", resetForm);

  render();
})();
