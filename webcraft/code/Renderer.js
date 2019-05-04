class Renderer {
    constructor() {
        this.chunkMeshes = new Map();

        this.models = new Map();

        this.canvas = document.getElementById("glCanvas");

        this.gl = this.canvas.getContext("webgl2");
        if (this.gl == null) {
            alert("Cannot use webgl");
            return;
        }

        rm = new ResourceManager(this.gl);

        this.altas = rm.getTexture("atlas");

        this.shader = rm.createShader("normal", basic_vertex, basic_fragment);
        this.mUniform = this.shader.getUniform("modelMatrix");
        this.vUniform = this.shader.getUniform("viewMatrix");
        this.pUniform = this.shader.getUniform("projMatrix");

        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.enable(this.gl.SAMPLE_ALPHA_TO_COVERAGE);
        this.gl.sampleCoverage(0.9, false);
        this.gl.frontFace(this.gl.CW);
        this.gl.cullFace(this.gl.FRONT);

        this.pMatrix = new Float32Array(16);
        this.mvMatrix = new Float32Array(16);
        this.vMatrix = new Float32Array(16);
        this.sToWorld = new Float32Array(16);

        this.resizeCanvas(800, 600);
        this.setCam([0, 0, 0], [0, 0, 0]);
    }

    get opengl() {
        return this.gl;
    }

    loadModel(name, texture, data) {
        var model = this.models.get(name);

        if (model != null) {
            model.mesh.free();
            model.tex.free();
        }

        model = {
            mesh: rm.createMesh(name + "_m", data),
            tex: rm.getTexture(texture),
            instances: new Set(),
        }

        this.models.set(name, model);
    }

    freeModel(name) {
        var model = this.models.get(name);

        if (model != null) {
            rm.freeMesh(name + "_m");

            this.models.delete(model);
        }
    }

    addInstance(model, instance) {
        var i = this.models.get(model).instances;

        var mMatrix = new Float32Array(16);
        mat4.identity(mMatrix);

        mat4.translate(mMatrix, mMatrix, instance.position);

        mat4.rotate(mMatrix, mMatrix, glMatrix.toRadian(instance.rotation[0]), [1, 0, 0]);
        mat4.rotate(mMatrix, mMatrix, glMatrix.toRadian(instance.rotation[1]), [0, 1, 0]);
        mat4.rotate(mMatrix, mMatrix, glMatrix.toRadian(instance.rotation[2]), [0, 0, 1]);

        instance.matrix = mMatrix;

        i.add(instance);
    }

    clearColor(red, green, blue) {
        this.gl.clearColor(red, green, blue, 1.0);
    }

    freeChunk(hash) {
        var chunk = this.chunkMeshes.get(hash);

        if (chunk != null) {
            rm.freeMesh(hash);
        }

        this.chunkMeshes.delete(hash)
    }

    generateChunkMesh(world, position) {
        const hash = world.chunkHash(position[0], position[1], position[2]);
        var chunk = this.chunkMeshes.get(hash);
        if (chunk != undefined ) {
            rm.freeMesh(hash);
        }

        var vertex = [];
        var indices = [];
        var coords = [];

        for(var x = 0; x < world.cl; x++) {
            for(var y = 0; y < world.cl; y++) {
                for(var z = 0; z < world.cl; z++) {
                    var bx = x + position[0] * world.cl;
                    var by = y + position[1] * world.cl;
                    var bz = z + position[2] * world.cl;
                    var block = world.getBlock(bx, by, bz);

                    var addFace = function(face, coord, normal) {
                        var idx = Math.floor(vertex.length / 6);

                        for(var i = 0; i < 4; i++) {
                            vertex.push(x + face[0 + i * 3]);
                            vertex.push(y + face[1 + i * 3]);
                            vertex.push(z + face[2 + i * 3]);
                            vertex.push(normal[0]);
                            vertex.push(normal[1]);
                            vertex.push(normal[2]);
                        }
                        indices.push(idx); indices.push(idx + 1); indices.push(idx + 2);
                        indices.push(idx); indices.push(idx + 2); indices.push(idx + 3);

                        var rc = [coord[0] / 16, coord[1] / 16, (coord[0] + 1) / 16, (coord[1] + 1) / 16];

                        coords.push(rc[0]);  coords.push(rc[1]);
                        coords.push(rc[2]);  coords.push(rc[1]);
                        coords.push(rc[2]);  coords.push(rc[3]);
                        coords.push(rc[0]);  coords.push(rc[3]);
                    }
                    
                    if (!block.air) {
                        var condition = null;
                        if (block.transparent) {
                            condition = function(ablock) { 
                                if (ablock.transparent) return ablock.name != block.name;
                                else return ablock.air;
                            };
                        } else {
                            condition = function(ablock) {
                                return ablock.transparent == true;
                            };
                        }
                        if (condition(world.getBlock(bx - 1, by, bz))) {
                            addFace([
                                0, 1, 1,
                                0, 1, 0,
                                0, 0, 0,
                                0, 0, 1,
                            ], block.sides, [-1, 0, 0]);
                        }

                        if (condition(world.getBlock(bx + 1, by, bz))) {
                            addFace([
                                1, 1, 0,
                                1, 1, 1,
                                1, 0, 1,
                                1, 0, 0
                            ], block.sides, [+1, 0, 0]);
                        }

                        if (condition(world.getBlock(bx, by, bz - 1))) {
                            addFace([
                                0, 1, 0,
                                1, 1, 0,
                                1, 0, 0,
                                0, 0, 0
                            ], block.sides, [0, 0, -1]);
                        }

                        if (condition(world.getBlock(bx, by, bz + 1))) {
                            addFace([
                                1, 1, 1,
                                0, 1, 1,
                                0, 0, 1,
                                1, 0, 1,
                            ], block.sides, [0, 0, 1]);
                        }

                        if (condition(world.getBlock(bx, by + 1, bz))) {
                            addFace([
                                0, 1, 1,
                                1, 1, 1,
                                1, 1, 0,
                                0, 1, 0,
                            ], block.top, [0, 1, 0]);
                        }

                        if (condition(world.getBlock(bx, by - 1, bz))) {
                            addFace([
                               0, 0, 0,
                               1, 0, 0,
                               1, 0, 1,
                               0, 0, 1,
                            ], block.bottom, [0, -1, 0]);
                        }
                    }
                }
            }
        }

        var data = {
            vertex: vertex,
            indices: indices,
            coords: coords,
        }

        if (indices.length == 0) return;

        var model = new Float32Array(16);
        mat4.identity(model);

        mat4.translate(model, model, [position[0] * world.cl, position[1] * world.cl, position[2] * world.cl]);
        this.chunkMeshes.set(world.chunkHash(position[0], position[1], position[2]), {
            model : model,
            mesh : rm.createMesh(hash, data),
        });
    }

    resizeCanvas(w, h) {
        mat4.perspective(this.pMatrix,
            glMatrix.toRadian(90),
            w / h,
            0.1, 1000);

        this.canvas.width = w;
        this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
    }

    setCam(position, rotation) {
        var desp = [-position[0], -position[1], -position[2]];
        mat4.identity(this.vMatrix);

        mat4.rotate(this.vMatrix, this.vMatrix, glMatrix.toRadian(rotation[0]), [1, 0, 0]);
        mat4.rotate(this.vMatrix, this.vMatrix, glMatrix.toRadian(rotation[1]), [0, 1, 0]);
        mat4.rotate(this.vMatrix, this.vMatrix, glMatrix.toRadian(rotation[2]), [0, 0, 1]);

        mat4.translate(this.vMatrix, this.vMatrix, desp);

        var pvMatrix = new Float32Array(16);
        mat4.multiply(pvMatrix, this.pMatrix, this.vMatrix);

        mat4.invert(this.sToWorld, pvMatrix);
    }

    screenToWorld(x, y) {
        var vec = [2 * (x/this.canvas.width) - 1, 2 * -(y/this.canvas.height) +1, 0, 1.0];
        
        vec4.transformMat4(vec, vec, this.sToWorld);
        return [vec[0] / vec[3], vec[1] / vec[3], vec[2] / vec[3]];
    }

    render() {
        if (this.canvas.width != window.innerWidth
            || this.canvas.height != window.innerHeight)
            this.resizeCanvas(window.innerWidth, window.innerHeight);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        this.shader.bind();

        this.gl.uniformMatrix4fv(this.pUniform, false, this.pMatrix);
        this.gl.uniformMatrix4fv(this.vUniform, false, this.vMatrix);

        //Draw chunks
        this.altas.bind();
        var rnd = this;
        this.chunkMeshes.forEach(function(value, key, map) {
            rnd.gl.uniformMatrix4fv(rnd.mUniform, false, value.model);
            var mesh = value.mesh;
            mesh.bind();
            mesh.draw();
            mesh.unbind();
        });

        this.altas.unbind();

        this.models.forEach(function(value) {
            value.tex.bind();
            value.mesh.bind();
            value.instances.forEach(function(ins) {
                rnd.gl.uniformMatrix4fv(rnd.mUniform, false, ins.matrix);
                value.mesh.draw();
            });
            value.mesh.unbind();
            value.tex.unbind();
        });

        this.shader.unbind();
    }
}