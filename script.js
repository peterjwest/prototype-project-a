THREE.Object3D.prototype.setVisible = function(visible) {
  return this.traverse(function(object) { object.visible = visible; });
};

var average = function(data) {
  var sum = data.reduce(function(sum, value){
    return sum + value;
  }, 0);

  var avg = sum / data.length;
  return avg;
};

var standardDeviation = function(values) {
  var averageValue = average(values);
  var squareDiffs = values.map(function(value) {
    var diff = value - averageValue;
    var sqrDiff = diff * diff;
    return sqrDiff;
  });

  return Math.sqrt(average(squareDiffs));
};

var roundRotation = function(value) {
  return value < 0 ? (value + 2 * Math.PI) : value;
};

var rotationDifference = function(a, b) {
  return Math.sqrt(
    Math.pow(roundRotation(a.x) - roundRotation(b.x), 2) +
    Math.pow(a.y - b.y, 2) +
    Math.pow(a.z - b.z, 2)
  );
};

ARController.getUserMediaThreeScene({
  maxARVideoSize: 640,
  cameraParam: 'vendor/camera_para-iPhone_5_rear_640x480_1.0m.dat',
  onSuccess: function(scene, controller) {
    controller.setPatternDetectionMode(artoolkit.AR_MATRIX_CODE_DETECTION);
    controller.setPattRatio(150/226);
    controller.setMatrixCodeType(artoolkit.AR_MATRIX_CODE_4x4_BCH_13_9_3);

    var renderer = new THREE.WebGLRenderer({antialias: false});
    renderer.setSize(controller.videoWidth, controller.videoHeight);

    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    var light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(0, -1, -1);
    scene.scene.add(light);

    var blueMaterial = new THREE.MeshLambertMaterial({ color: 'blue', side: THREE.DoubleSide });
    var redMaterial = new THREE.MeshLambertMaterial({ color: 'red', side: THREE.DoubleSide });
    var normalMaterial = new THREE.MeshNormalMaterial();

    var markers = [];
    for (var i = 0; i < 512; i++) {
      var marker = new THREE.Object3D();
      marker.markerId = i;
      marker.position.z = -5;
      marker.old = new THREE.Object3D();

      var box = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.3),
        normalMaterial
      );
      //box.position.z = -0.5;
      marker.add(box);
      marker.box = box;

      scene.scene.add(marker);
      markers.push(marker);
    }

    // var testMarker = new THREE.Mesh(
    //   new THREE.BoxGeometry(0.8, 0.8, 0.3),
    //   normalMaterial
    // );
    // testMarker.position.z = 10;
    // testMarker.rotation.x = -0.3;
    // testMarker.rotation.y = 0.3;
    // scene.scene.add(testMarker);

    var dynamicTriggeed = false;
    var templateTriggered = false;
    var oldDynamic = new THREE.Object3D();
    var oldTemplate = new THREE.Object3D();

    controller.addEventListener('getMarker', function(ev) {
      if (ev.data.marker.idMatrix !== 1 && ev.data.marker.idMatrix !== 2) return;
      if (ev.data.marker.idMatrix === 2 && templateTriggered == true) return;
      if (ev.data.marker.idMatrix >= 0 && ev.data) {
        var marker = markers[ev.data.marker.idMatrix];
        marker.matrix.elements.set(ev.data.matrix);
        marker.matrix.decompose(marker.position, marker.quaternion, new THREE.Vector3());
        marker.active = 5;
        marker.setVisible(true);
      }
      if (!dynamicTriggeed && ev.data.marker.idMatrix === 1) {
        dynamicTriggeed = true;
        oldDynamic.position.copy(marker.position);
        oldDynamic.quaternion.copy(marker.quaternion);
        console.log(oldDynamic);
      }
      if (ev.data.marker.idMatrix === 2) {
        templateTriggered = true;
        oldTemplate.position.copy(marker.position);
        oldTemplate.quaternion.copy(marker.quaternion);
      }
    });
    
    var tick = function() {
      scene.process();

      if (markers[1].active > 0) {
        markers[2].quaternion.copy(
          oldDynamic.quaternion.clone().inverse()
          .premultiply(markers[1].quaternion)
          .multiply(oldTemplate.quaternion)
        );
        markers[2].position.copy(
          oldTemplate.position.clone().sub(oldDynamic.position).applyQuaternion(
            oldDynamic.quaternion.clone().inverse().premultiply(markers[1].quaternion)
          ).add(markers[1].position)
        );
      }

      var actives = markers.filter(function(marker) {
        return marker.active;
      });

      var index = actives.map(function(marker) {
        return rotationDifference(actives[0].rotation, marker.rotation);
      }).reduce(function(maxIndex, difference, index, array) {
        return difference > array[maxIndex] ? index : maxIndex;
      }, 0);

      if (index > 0 && rotationDifference(actives[0].rotation, actives[index].rotation) > 0.5) {
        var groups = [
          [actives[0]],
          [actives[index]],
        ];

        actives.map(function(marker, i) {
          if (i !== 0 && i !== index) {
            var a = rotationDifference(groups[0][0].rotation, marker.rotation);
            var b = rotationDifference(groups[1][0].rotation, marker.rotation);
            groups[a < b ? 0 : 1].push(marker);
          }
        });

        if (groups[1].length > groups[0].length) {
          groups = [groups[1], groups[0]];
        }
      }
      else {
        var groups = [actives, []];
      }

      // groups[0].map(function(marker) {
      //   marker.box.material = redMaterial;
      // });
      // groups[1].map(function(marker) {
      //   marker.box.material = blueMaterial;
      //   //marker.box.quaternion.copy(marker.quaternion).conjugate().multiply(groups[0][0].quaternion);
      //   var position = marker.position.clone().multiplyScalar(1).normalize();
      //   var unit = new THREE.Vector3(0, 0, 1).applyQuaternion(marker.quaternion);
      //   var angle = Math.PI - Math.acos(position.clone().dot(unit));
      //   var centerRotation = new THREE.Quaternion().setFromAxisAngle(position.clone().cross(unit).normalize(), angle * 2);
      //   marker.quaternion.premultiply(centerRotation);
      // });

      scene.renderOn(renderer);

      markers.map(function(marker) {
        // if (marker.active > 0) marker.active--;
        // else marker.setVisible(false);

        marker.old.position.copy(marker.position);
        marker.old.quaternion.copy(marker.quaternion);
      });

      requestAnimationFrame(tick);
    };

    tick();
  }
});

delete window.ARThreeOnLoad;
