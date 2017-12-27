import mapboxgl from 'mapbox-gl';

class Map {

  _setupMapColor() {
    if (this._map.isStyleLoaded()) {
      // TODO: Duplicated code
      let that = this
      let stops = this._co2color.range()
        .map((d, i) => [that._co2color.domain()[i], d])
      this._map.setPaintProperty('zones-fill', 'fill-color', {
        default: 'gray',
        property: 'co2intensity',
        stops: stops,
      });
    }
  }

  _setData() {
    if (!this._data) { return; }
    const source = this._map.getSource('world');
    const data = {
      type: 'FeatureCollection',
      features: this._geometries,
    };
    if (source) {
      source.setData(data);
    } else if (this._map.isStyleLoaded()) {
      // Create source
      this._map.addSource('world', {
        type: 'geojson',
        data,
      });
      // Create layers
      const that = this;
      const stops = this._co2color.range()
        .map((d, i) => [that._co2color.domain()[i], d]);
      this._map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'world',
        layout: {},
        paint: {
          // 'fill-color': 'gray', // ** TODO: Duplicated code
          'fill-color': {
            default: 'gray',
            property: 'co2intensity',
            stops,
          },
        },
      });
      this._map.addLayer({
        id: 'zones-hover',
        type: 'fill',
        source: 'world',
        layout: {},
        paint: {
          'fill-color': 'white',
          'fill-opacity': 0.5,
        },
        filter: ['==', 'zoneId', ''],
      });
      // Note: if stroke width is 1px, then it is faster to use fill-outline in fill layer
      this._map.addLayer({
        id: 'zones-line',
        type: 'line',
        source: 'world',
        layout: {},
        paint: {
          'line-color': '#555555',
          'line-width': this.STROKE_WIDTH,
        },
      });
    }
  }

  constructor(selectorId, wind, windCanvasSelectorId, solar, solarCanvasSelectorId) {
    let that = this;

    this.STROKE_WIDTH = 0.3;

    this.selectedCountry = undefined;

    this._center = undefined;
    this.startScale = 400;

    this.windCanvas = document.getElementById(windCanvasSelectorId);
    this.solarCanvas = document.getElementById(solarCanvasSelectorId);

    this._map = new mapboxgl.Map({
      container: selectorId, // selector id
      attributionControl: false,
      dragRotate: false,
      style: {
        version: 8,
        // transition: { duration: 500 },
        sources: {},
        layers: [],
        zoom: 3,
        center: this._center || [0, 50],
      },
    });

    this._map.on('load', () => {
      // Here we need to set all styles
      this._setData.call(that);
      this._setupMapColor.call(that);
    });

    setInterval(() => console.log(that._map.loaded()), 500)
    this._map.on('dataloading', () => console.log('dataloading'))
    this._map.on('styledataloading', () => console.log('styledataloading'))
    this._map.on('sourcedataloading', () => console.log('sourcedataloading'))

    // Add zoom and rotation controls to the map.
    this._map.addControl(new mapboxgl.NavigationControl());

    this._map.on('mouseenter', 'zones-fill', e => {
      that._map.getCanvas().style.cursor = 'pointer'
      if (that.countryMouseOverHandler) {
        let i = e.features[0].id
        that.countryMouseOverHandler.call(this, that._data[i], i)
      }
    })
    let prevId = undefined;
    this._map.on('mousemove', 'zones-fill', e => {
      if (prevId != e.features[0].properties.zoneId) {
        prevId = e.features[0].properties.zoneId
        // ** TRY: setData() with just the poly instead
        that._map.setFilter('zones-hover',
          ['==', 'zoneId', e.features[0].properties.zoneId])
      }
      if (that.countryMouseMoveHandler) {
        let i = e.features[0].id
        that.countryMouseMoveHandler.call(this, that._data[i], i, e.point.x, e.point.y)
      }
    })
    this._map.on('mouseleave', 'zones-fill', e => {
      that._map.getCanvas().style.cursor = ''
      that._map.setFilter('zones-hover', ['==', 'zoneId', ''])
      if (that.countryMouseOutHandler) {
        that.countryMouseOutHandler.call(this)
      }
    })
    this._map.on('click', 'zones-fill', e => {
      if (that.countryClickHandler) {
        let i = e.features[0].id
        that.countryClickHandler.call(this, that._data[i], i)
      }
    });

    /* Adding the exchange layer 

    - inside #zones .mapboxgl-canvas-container (at the end)
    - exchange layer should be part of this?
    - create an arrow component

    */

    // *** PAN/ZOOM ***
    let dragInitialTransform;
    let dragStartTransform;
    const node = document.getElementById(selectorId);
    const initialMapWidth = node.getBoundingClientRect().width;
    const initialMapHeight = node.getBoundingClientRect().height;

    const arrowsLayer = document.getElementById('arrows-layer');
    const canvasLayers = [that.windCanvas, that.solarCanvas];

    function onPanZoom(e) {
      const transform = {
        x: e.target.transform.x,
        y: e.target.transform.y,
        k: e.target.transform.scale,
      };
      // Canvas have the size of the viewport, and must be translated only
      // by the amount since last translate, since they are repositioned after each.
      const relativeScale = transform.k / dragStartTransform.k;
      canvasLayers.forEach(d => {
        d.style.transform =
          'translate(' +
          (dragStartTransform.x * relativeScale - transform.x) + 'px,' +
          (dragStartTransform.y * relativeScale - transform.y) + 'px)' +
          'scale(' + relativeScale + ')';
      });
      
      // This layer has size larger than viewport, and is not repositioned.
      // it should therefore be translated by the amount since first draw
      const relativeInitialScale = transform.k / dragInitialTransform.k;
      // arrowsLayer.style('transform-origin', 'center')
      arrowsLayer.style.transform =
        'translate(' +
        // (dragInitialTransform.x * relativeInitialScale - transform.x + (1 - relativeInitialScale) * 0.5 * 0) + 'px,' +
        // (dragInitialTransform.y * relativeInitialScale - transform.y + (1 - relativeInitialScale) * 0.5 * 0) + 'px)' +
        (dragInitialTransform.x * relativeInitialScale - transform.x + (1 - relativeInitialScale) * 0.5 * initialMapWidth) + 'px,' +
        (dragInitialTransform.y * relativeInitialScale - transform.y + (1 - relativeInitialScale) * 0.5 * initialMapHeight) + 'px)' +
        'scale(' + (relativeInitialScale) + ')';

      /*
      
      probably we must reset the other relatives because they relate to last since projection?
      YES. Because wind has the same issue.
      1. show
      2. resize
      3. drag -> error

      MAYBE FIRST: test perfs with iPad

      */

    }

    function onPanZoomStart(e) {
      if (that.zoomEndTimeout) {
        clearTimeout(that.zoomEndTimeout);
        that.zoomEndTimeout = undefined;
      }
      const transform = {
        x: e.target.transform.x,
        y: e.target.transform.y,
        k: e.target.transform.scale,
      };
      if (!dragInitialTransform) {
        dragInitialTransform = transform;
      }
      if (!dragStartTransform) {
        // Zoom start
        // arrowsLayer.style.display = 'none';
        dragStartTransform = transform;
        wind.pause(true);
      }
    }

    function onPanZoomEnd(e) {
      // Note that zoomend() methods are slow because they recalc layer.
      // Therefore, we debounce them.

      that.zoomEndTimeout = setTimeout(function() {
          // Notify. This is where we would need a Reactive / Pub-Sub system instead.
          wind.zoomend();
          solar.zoomend();
          canvasLayers.forEach(d => d.style.transform = null);
          wind.pause(false);
          arrowsLayer.style.display = null;

          that.dragEndHandler();

          dragStartTransform = undefined;
          that.zoomEndTimeout = undefined;
      }, 500);
    }

    this._map.on('drag', onPanZoom);
    this._map.on('zoom', onPanZoom);
    this._map.on('dragstart', onPanZoomStart);
    this._map.on('zoomstart', onPanZoomStart);
    this._map.on('dragend', onPanZoomEnd);
    this._map.on('zoomend', onPanZoomEnd);

    return this;
  }

  co2color(arg) {
    if (!arg) return this._co2color;
    else {
      this._co2color = arg
      this._setupMapColor.call(this)
    }
    return this;
  };

  projection() {
    // Read-only property
    const that = this;
    return (lonlat) => {
      const p = this._map.project(lonlat);
      return [p.x, p.y];
    }
  };

  unprojection() {
     // Read-only property
    const that = this;
    return (xy) => {
      const p = this._map.unproject(xy);
      return [p.lng, p.lat];
    }
  };

  onSeaClick(arg) {
      if (!arg) return this.seaClickHandler;
      else this.seaClickHandler = arg;
      return this;
  };

  onCountryClick(arg) {
      if (!arg) return this.countryClickHandler;
      else this.countryClickHandler = arg;
      return this;
  };

  onCountryMouseOver(arg) {
      if (!arg) return this.countryMouseOverHandler;
      else this.countryMouseOverHandler = arg;
      return this;
  };

  onCountryMouseMove(arg) {
      if (!arg) return this.countryMouseMoveHandler;
      else this.countryMouseMoveHandler = arg;
      return this;
  };

  onCountryMouseOut(arg) {
      if (!arg) return this.countryMouseOutHandler;
      else this.countryMouseOutHandler = arg;
      return this;
  };

  onDragEnd(arg) {
      if (!arg) return this.dragEndHandler;
      else this.dragEndHandler = arg;
      return this;
  };

  data(data) {
    if (!data) {
      return this._data;
    } else {
      this._data = data;
      this._geometries = []

      let that = this

      Object.keys(data).forEach((k, i) => {
        let geometry = data[k]
        // Remove empty geometries
        geometry.coordinates = geometry.coordinates.filter(d => d.length != 0)

        that._geometries.push({
            'id': k,
            'type': 'Feature',
            'geometry': geometry,
            'properties': {
                'zoneId': k,
                'co2intensity': data[k].co2intensity
            }
        })
      })

      this._setData.call(this)
      
    }
    return this;
  };

  center(center) {
    if (!center) {
      return this._center;
    } else {
      this._center = center;
      this._map.panTo(center);
    }
    return this;
  };

}

module.exports = Map;