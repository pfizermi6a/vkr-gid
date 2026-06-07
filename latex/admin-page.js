(function () {
  function byId(id) { return document.getElementById(id); }

  let editingId = null;
  let editingRouteId = null;
  let routePoints = [];
  let placesCache = [];
  let coordsMap = null;
  let coordsPlacemark = null;

  async function fillCategorySelect() {
    const select = byId('category');
    const categories = await window.PlacesStore.getCategories();
    select.innerHTML = '';
    categories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat.slug;
      option.textContent = cat.label;
      select.appendChild(option);
    });
  }

  function readForm() {
    const gallery = byId('gallery').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 10);
    return window.PlacesStore.normalizePlace({
      id: byId('id').value || undefined,
      name: byId('name').value,
      category: byId('category').value,
      description: byId('description').value,
      object_info: byId('objectInfo').value,
      lat: byId('lat').value,
      lon: byId('lon').value,
      cover_image_url: byId('cover').value,
      gallery,
      address: byId('address').value,
      open_hours: byId('openHours').value,
      phone: byId('phone').value,
      website_url: byId('website').value,
      visible: byId('visible').checked,
    });
  }

  function resetForm() {
    byId('objectForm').reset();
    byId('visible').checked = true;
    byId('descriptionCounter').textContent = '0/300';
    editingId = null;
    byId('saveBtn').textContent = 'Сохранить объект';
  }

  async function renderList() {
    const places = await window.PlacesStore.getAdminPlaces();
    placesCache = places;
    const body = byId('objectsList');
    body.innerHTML = '';

    places.forEach((place) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${place.name}</td>
        <td>${place.category}</td>
        <td>${place.visible ? 'Да' : 'Нет'}</td>
        <td>
          <button class="btn btn-sm edit" data-id="${place.id}">Редактировать</button>
          <button class="btn btn-sm delete" data-id="${place.id}">Удалить</button>
        </td>
      `;
      body.appendChild(row);
    });

    fillRoutePlaceSelect();

    body.onclick = async (e) => {
      const id = e.target.dataset.id;
      if (!id) return;
      if (e.target.classList.contains('delete')) {
        await window.PlacesStore.deletePlace(id);
        await renderList();
        await renderRoutesList();
        return;
      }
      if (e.target.classList.contains('edit')) {
        const place = (await window.PlacesStore.getAdminPlaces()).find((p) => p.id === id);
        if (!place) return;
        editingId = id;
        byId('id').value = place.id;
        byId('name').value = place.name;
        byId('category').value = place.category;
        byId('description').value = place.description;
        byId('descriptionCounter').textContent = `${place.description.length}/300`;
        byId('objectInfo').value = place.object_info || '';
        byId('lat').value = place.lat;
        byId('lon').value = place.lon;
        byId('cover').value = place.cover_image_url;
        byId('gallery').value = (place.gallery || []).join('\n');
        byId('address').value = place.address || '';
        byId('openHours').value = place.open_hours || '';
        byId('phone').value = place.phone || '';
        byId('website').value = place.website_url || '';
        byId('visible').checked = place.visible !== false;
        byId('saveBtn').textContent = 'Обновить объект';
      }
    };
  }

  async function handleSave(e) {
    e.preventDefault();
    const place = readForm();
    const errors = window.PlacesStore.validatePlace(place);
    const err = byId('formErrors');
    if (errors.length) {
      err.innerHTML = errors.map((x) => `<li>${x}</li>`).join('');
      return;
    }
    err.innerHTML = '';

    await window.PlacesStore.savePlace({ ...place, id: editingId || place.id });
    await renderList();
    resetForm();
  }

  function bindCategoryAdd() {
    byId('addCategoryBtn').addEventListener('click', async () => {
      const input = byId('newCategory');
      const value = input.value.trim();
      if (!value) return;
      const result = await window.PlacesStore.addCategory(value);
      if (!result.ok) { alert(result.message); return; }
      input.value = '';
      await fillCategorySelect();
    });
  }

  function bindCounter() {
    const desc = byId('description');
    desc.addEventListener('input', () => {
      if (desc.value.length > 300) desc.value = desc.value.slice(0, 300);
      byId('descriptionCounter').textContent = `${desc.value.length}/300`;
    });

    const shortDesc = byId('routeShortDescription');
    shortDesc.addEventListener('input', () => {
      if (shortDesc.value.length > 300) shortDesc.value = shortDesc.value.slice(0, 300);
      byId('routeShortDescriptionCounter').textContent = `${shortDesc.value.length}/300`;
    });
  }

  function fillRoutePlaceSelect() {
    const select = byId('routePointSelect');
    if (!select) return;
    select.innerHTML = '';

    placesCache.forEach((place) => {
      const option = document.createElement('option');
      option.value = place.id;
      option.textContent = `${place.name} (${place.category})`;
      select.appendChild(option);
    });
  }

  function renderRoutePointsList() {
    const list = byId('routePointsList');
    list.innerHTML = '';

    routePoints.forEach((placeId, index) => {
      const place = placesCache.find((p) => p.id === placeId);
      const li = document.createElement('li');
      li.className = 'route-point-item';
      li.innerHTML = `
        <span><b>${index === 0 ? 'Старт' : index === routePoints.length - 1 ? 'Финиш' : `Точка ${index + 1}`}</b>: ${place ? place.name : placeId}</span>
        <span class="route-point-actions">
          <button type="button" class="btn btn-sm move-up" data-index="${index}">↑</button>
          <button type="button" class="btn btn-sm move-down" data-index="${index}">↓</button>
          <button type="button" class="btn btn-sm remove" data-index="${index}">✕</button>
        </span>
      `;
      list.appendChild(li);
    });

    byId('routePointsHint').textContent = routePoints.length < 2
      ? 'Добавьте минимум 2 точки: старт и финиш.'
      : `Точек в маршруте: ${routePoints.length}`;
  }

  function resetRouteForm() {
    byId('routeForm').reset();
    byId('routeVisible').checked = true;
    byId('routeShortDescriptionCounter').textContent = '0/300';
    routePoints = [];
    editingRouteId = null;
    byId('saveRouteBtn').textContent = 'Сохранить маршрут';
    byId('routeFormErrors').innerHTML = '';
    renderRoutePointsList();
  }

  function readRouteForm() {
    return window.PlacesStore.normalizeRoute({
      id: byId('routeId').value || undefined,
      name: byId('routeName').value,
      short_description: byId('routeShortDescription').value,
      description: byId('routeDescription').value,
      visible: byId('routeVisible').checked,
      points: routePoints.map((placeId, index) => ({ place_id: placeId, position: index })),
    });
  }

  async function renderRoutesList() {
    const routes = await window.PlacesStore.getAdminRoutes();
    const body = byId('routesList');
    body.innerHTML = '';

    routes.forEach((route) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${route.name}</td>
        <td>${route.points.length}</td>
        <td>${route.visible ? 'Да' : 'Нет'}</td>
        <td>
          <button class="btn btn-sm edit-route" data-id="${route.id}">Редактировать</button>
          <button class="btn btn-sm delete-route" data-id="${route.id}">Удалить</button>
        </td>
      `;
      body.appendChild(row);
    });

    body.onclick = async (e) => {
      const id = e.target.dataset.id;
      if (!id) return;

      if (e.target.classList.contains('delete-route')) {
        await window.PlacesStore.deleteRoute(id);
        await renderRoutesList();
        return;
      }

      if (e.target.classList.contains('edit-route')) {
        const route = routes.find((r) => r.id === id);
        if (!route) return;
        editingRouteId = route.id;
        byId('routeId').value = route.id;
        byId('routeName').value = route.name;
        byId('routeShortDescription').value = route.short_description || '';
        byId('routeShortDescriptionCounter').textContent = `${(route.short_description || '').length}/300`;
        byId('routeDescription').value = route.description || '';
        byId('routeVisible').checked = route.visible !== false;
        routePoints = route.points.map((point) => point.place_id);
        byId('saveRouteBtn').textContent = 'Обновить маршрут';
        renderRoutePointsList();
      }
    };
  }

  async function handleRouteSave(e) {
    e.preventDefault();
    const route = readRouteForm();
    const errors = window.PlacesStore.validateRoute(route);
    const err = byId('routeFormErrors');
    if (errors.length) {
      err.innerHTML = errors.map((x) => `<li>${x}</li>`).join('');
      return;
    }
    err.innerHTML = '';

    await window.PlacesStore.saveRoute({ ...route, id: editingRouteId || route.id });
    await renderRoutesList();
    resetRouteForm();
  }

  function bindRouteBuilder() {
    byId('addRoutePointBtn').addEventListener('click', () => {
      const selected = byId('routePointSelect').value;
      if (!selected) return;
      routePoints.push(selected);
      renderRoutePointsList();
    });

    byId('routePointsList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-index]');
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      if (btn.classList.contains('remove')) {
        routePoints.splice(idx, 1);
      } else if (btn.classList.contains('move-up') && idx > 0) {
        [routePoints[idx - 1], routePoints[idx]] = [routePoints[idx], routePoints[idx - 1]];
      } else if (btn.classList.contains('move-down') && idx < routePoints.length - 1) {
        [routePoints[idx + 1], routePoints[idx]] = [routePoints[idx], routePoints[idx + 1]];
      }
      renderRoutePointsList();
    });

    byId('routeForm').addEventListener('submit', handleRouteSave);
    byId('resetRouteBtn').addEventListener('click', resetRouteForm);
  }

  function parseCoord(value) {
    const parsed = Number.parseFloat(String(value || '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function setCoords(lat, lon) {
    byId('lat').value = Number(lat).toFixed(6);
    byId('lon').value = Number(lon).toFixed(6);
  }

  function showCoordsModal() {
    byId('coordsModal').classList.add('show');
    byId('coordsModal').setAttribute('aria-hidden', 'false');
  }

  function closeCoordsModal() {
    byId('coordsModal').classList.remove('show');
    byId('coordsModal').setAttribute('aria-hidden', 'true');
  }

  function waitForYmaps() {
    return new Promise((resolve, reject) => {
      if (typeof ymaps !== 'undefined' && ymaps.ready) {
        ymaps.ready(resolve);
        return;
      }

      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (typeof ymaps !== 'undefined' && ymaps.ready) {
          clearInterval(timer);
          ymaps.ready(resolve);
          return;
        }
        if (attempts > 40) {
          clearInterval(timer);
          reject(new Error('Yandex Maps не загрузилась'));
        }
      }, 250);
    });
  }

  async function initCoordsMap() {
    await waitForYmaps();
    if (coordsMap) {
      coordsMap.container.fitToViewport();
      return coordsMap;
    }

    const lat = parseCoord(byId('lat').value) ?? 51.7277;
    const lon = parseCoord(byId('lon').value) ?? 36.19;

    coordsMap = new ymaps.Map('coordsMap', {
      center: [lat, lon],
      zoom: 13,
      controls: ['zoomControl'],
    });

    coordsMap.events.add('click', (e) => {
      const coords = e.get('coords');
      const selectedLat = Number(coords[0].toFixed(6));
      const selectedLon = Number(coords[1].toFixed(6));

      if (!coordsPlacemark) {
        coordsPlacemark = new ymaps.Placemark(coords, {}, { preset: 'islands#redDotIcon' });
        coordsMap.geoObjects.add(coordsPlacemark);
      } else {
        coordsPlacemark.geometry.setCoordinates(coords);
      }

      const shouldApply = window.confirm(`Внести координаты: ${selectedLat}, ${selectedLon}?`);
      if (!shouldApply) return;

      setCoords(selectedLat, selectedLon);
      closeCoordsModal();
    });

    return coordsMap;
  }

  function bindCoordsPicker() {
    byId('pickCoordsBtn').addEventListener('click', async () => {
      try {
        showCoordsModal();
        const map = await initCoordsMap();
        const lat = parseCoord(byId('lat').value);
        const lon = parseCoord(byId('lon').value);
        if (lat != null && lon != null) {
          map.setCenter([lat, lon], 14, { duration: 200 });
          if (!coordsPlacemark) {
            coordsPlacemark = new ymaps.Placemark([lat, lon], {}, { preset: 'islands#redDotIcon' });
            map.geoObjects.add(coordsPlacemark);
          } else {
            coordsPlacemark.geometry.setCoordinates([lat, lon]);
          }
        }
        setTimeout(() => map.container.fitToViewport(), 0);
      } catch (error) {
        console.error('Coords map init failed:', error);
        alert('Не удалось загрузить карту для выбора координат.');
        closeCoordsModal();
      }
    });

    byId('coordsModalClose').addEventListener('click', closeCoordsModal);
    byId('coordsModal').addEventListener('click', (e) => {
      if (e.target === byId('coordsModal')) closeCoordsModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCoordsModal();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await fillCategorySelect();
      await renderList();
      await renderRoutesList();
      bindCategoryAdd();
      bindCounter();
      bindRouteBuilder();
      bindCoordsPicker();
      byId('objectForm').addEventListener('submit', handleSave);
      byId('resetBtn').addEventListener('click', resetForm);
      renderRoutePointsList();
    } catch (error) {
      console.error('Admin init failed:', error);
      alert(`Не удалось подключиться к API/БД: ${error.message || error}`);
    }
  });
})();
